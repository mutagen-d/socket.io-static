const ss = require('socket.io-stream')
const EVENTS = require('./util/events')
const FSLocal = require('./fs.local')
const { transformFunctionValuesToReturnValues } = require('./util/tranform')

/**
 * @typedef {{
 *  read?: boolean;
 *  write?: boolean;
 *  delete?: boolean;
 * }} IOStaticOptions
 */
/**
 * @param {string} root
 * @param {IOStaticOptions} [options]
 */
function ioStatic(root, options = {}) {
  const localFs = new FSLocal(root)
  const opts = {
    read: options.read || true,
    write: options.write || true,
    delete: options.delete || false,
  }

  /**
   * @this {import('socket.io').Socket}
   * @param {import('stream').Writable} stream 
   * @param {import('./io-stream').ReadableStreamParams} from
   */
  async function onReadFile(stream, from) {
    try {
      const exists = await localFs.exists(from.path)
      if (!exists) {
        throw new Error(`file not found: ${from.path}`)
      }
      const file = await localFs.stat(from.path)
      if (file.isDirectory()) {
        throw new Error(`is not file: ${from.path}`)
      }
      const source = localFs.createReadStream(from.path, from.opts);
      source.pipe(stream)
    } catch (e) {
      stream.end('')
    }
  }

  /**
   * @this {import('socket.io').Socket}
   * @param {import('stream').Readable} stream 
   * @param {import('./io-stream').WritableStreamParams} to
   */
  function onWriteFile(stream, to) {
    try {
      const dest = localFs.createWriteStream(to.path, to.opts)
      stream.pipe(dest)
    } catch (e) {
      stream.destroy(e)
    }
  }

  /**
   * @template T
   * @param {Extract<T, (...args: any) => any>} fn 
   */
  const createListener = (fn) => {
    /** @type {(args: Parameters<T>, callback: (res: any) => void) => Promise<void>} */
    const listener = async (args, callback) => {
      try {
        const res = await fn(...args)
        if (typeof callback === 'function') {
          callback({ ok: true, data: transformFunctionValuesToReturnValues(res) })
        }
      } catch (e) {
        console.log(fn.name, 'error', e)
        if (typeof callback === 'function') {
          callback({ ok: false, error: e.message })
        }
      }
    }
    return listener;
  }

  const onStat = createListener(localFs.stat)
  const onReaddir = createListener(localFs.readdir)
  const onExists = createListener(localFs.exists)
  const onDel = createListener(localFs.del)
  const onStruct = createListener(localFs.struct)
  const onMkdir = createListener(localFs.mkdir)

  /**
   * @param {import('socket.io').Socket} socket 
   */
  function addListeners(socket) {
    if (socket._iostaticListeners) {
      return socket;
    }
    if (opts.write) {
      ss(socket).on(EVENTS.WRITE_FILE, onWriteFile)
      socket.on(EVENTS.MKDIR, onMkdir)
    }
    if (opts.read) {
      ss(socket).on(EVENTS.READ_FILE, onReadFile)
      socket.on(EVENTS.STAT, onStat)
      socket.on(EVENTS.READDIR, onReaddir)
      socket.on(EVENTS.EXISTS, onExists)
      socket.on(EVENTS.STRUCT, onStruct)
    }
    if (opts.delete) {
      socket.on(EVENTS.DEL, onDel)
    }

    socket._iostaticListeners = true;
    return socket;
  }

  /**
   * @param {import('socket.io').Socket} socket
   * @param {(err?: any) => void} [next]
   */
  return function middleware(socket, next) {
    addListeners(socket)
    if (typeof next === 'function') {
      next()
    }
  }
}

module.exports = ioStatic;
