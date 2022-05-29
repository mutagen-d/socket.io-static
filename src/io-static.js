const debug = require('debug')('socket.io-static')
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
      debug('reading file from "%s"', from.path)
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
      debug('read file error', e)
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
      debug('writing file to "%s"', to.path)
      const dest = localFs.createWriteStream(to.path, to.opts)
      stream.pipe(dest)
    } catch (e) {
      debug('write file error', e)
      stream.destroy(e)
    }
  }

  /**
   * @template T
   * @param {Extract<T, (...args: any) => any>} fn 
   * @param {any} [thisArg]
   */
  const createListener = (fn, thisArg) => {
    /** @type {(args: Parameters<T>, callback: (res: any) => void) => Promise<void>} */
    const listener = async (args, callback) => {
      try {
        debug('%s("%s")...', fn.name, args[0])
        const res = await fn.apply(thisArg, args)
        if (typeof callback === 'function') {
          callback({ ok: true, data: transformFunctionValuesToReturnValues(res) })
        }
      } catch (e) {
        debug('%s error', fn.name, e)
        if (typeof callback === 'function') {
          callback({ ok: false, error: e.message })
        }
      }
    }
    return listener;
  }

  const onStat = createListener(localFs.stat, localFs)
  const onReaddir = createListener(localFs.readdir, localFs)
  const onExists = createListener(localFs.exists, localFs)
  const onDel = createListener(localFs.del, localFs)
  const onStruct = createListener(localFs.struct, localFs)
  const onMkdir = createListener(localFs.mkdir, localFs)

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
    socket.on(EVENTS.ACTION, (action, path, ...args) => {
      debug('remote-action %s on path %s, args %o', action, path, args)
    })

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
