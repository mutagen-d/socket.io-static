const { normalize, join } = require('path')
const ss = require('socket.io-stream')
const Deffer = require('./util/deffer')
const EVENTS = require('./util/events')
const { isup } = require('./util/path')

/**
 * @template T
 * @typedef {import('./util/tranform').IFunToRetVal<T>} IFunToRetVal
 */
/**
 * @template T
 * @typedef {T extends PromiseLike<infer P> ? P : never} ThenArg
 */

/**
 * @template T
 * @typedef {T extends (...args: any[]) => Promise<any> ? ThenArg<ReturnType<T>> : never} ThenReturnType
 */

/**
 * @template T
 * @typedef {(...args: Parameters<T>) => Promise<IFunToRetVal<ThenReturnType<T>>>} FSRemoteMethod
 */

class FSRemote {
  /**
   * @param {string} root
   * @param {import('socket.io').Socket} socket
   * @param {number} [timeout]
   */
  constructor(root, socket, timeout = 10 * 1000) {
    root = normalize(root)
    if (isup(root)) {
      throw new Error('invalid path')
    }
    this.root = root
    /** @type {'remote'} */
    this.type = 'remote'
    /** @type {import('socket.io').Socket} */
    this.socket = socket
    this.timeout = timeout
  }

  get emitter() {
    return this.socket
  }

  isConnected() {
    return !!this.socket && this.socket.connected
  }

  /** @type {FSRemoteMethod<import('fs')['promises']['stat']>} */
  stat(...args) {
    args[0] = this.path(args[0])
    return this.send(EVENTS.STAT, args)
  }

  /**
   * @template P
   * @type {FSRemoteMethod<import('./fs.local').Readdir<P>>}
   */
  readdir(...args) {
    args[0] = this.path(args[0])
    return this.send(EVENTS.READDIR, args)
  }

  /**
   * @param {string} path
   * @returns {Promise<boolean>}
   */
  exists(path) {
    path = this.path(path)
    return this.send(EVENTS.EXISTS, [path])
  }

  /** @type {FSRemoteMethod<import('del')>} */
  del(...args) {
    args[0] = this.path(args[0])
    return this.send(EVENTS.DEL, args)
  }

  /**
   * @param {string} path
   * @returns {Promise<(import('./fs.local').DirLike | import('./fs.local').FileLike)[]>}
   */
  struct(path) {
    path = this.path(path)
    return this.send(EVENTS.STRUCT, [path])
  }

  /** @type {FSRemoteMethod<import('fs')['promises']['mkdir']>} */
  mkdir(...args) {
    args[0] = this.path(args[0])
    return this.send(EVENTS.MKDIR, args)
  }

  /**
   * @param {Parameters<typeof import('fs').createWriteStream>} args
   * @returns {ReturnType<typeof import('fs').createWriteStream>}
   */
  createWriteStream(...args) {
    var [path, opts] = args;
    path = this.path(path)
    /** @type {import('stream').Duplex} */
    const stream = ss.createStream()
    const to = { path, opts }
    ss(this.socket).emit(EVENTS.WRITE_FILE, stream, to)
    return stream;
  }

  /**
   * @param {Parameters<typeof import('fs').createReadStream>} args
   * @returns {ReturnType<typeof import('fs').createReadStream>}
   */
  createReadStream(...args) {
    var [path, opts] = args;
    path = this.path(path)
    /** @type {import('stream').Duplex} */
    const stream = ss.createStream()
    const from = { path, opts }
    ss(this.socket).emit(EVENTS.READ_FILE, stream, from)
    return stream;
  }

  /**
   * @param {string} action
   * @param {string} path
   * @param {any[]} args
   * @returns {boolean} whether or not action sent
   */
  action(action, path, ...args) {
    if (this.emitter) {
      path = this.path(path)
      this.emitter.emit(EVENTS.ACTION, action, path, ...args)
    }
    return !!this.emitter
  }

  /**
   * @param {string} path
   */
  path(path) {
    if (isup(path)) {
      throw new Error('invalid path')
    }
    return join(this.root, normalize(path))
  }

  /**
   * @private
   * @param {string} event 
   * @param {any[]} args
   */
  async send(event, args) {
    const deffer = new Deffer()
    this.socket.timeout(this.timeout).emit(event, args, (err, res) => {
      if (err) {
        deffer.reject(err)
      } else if (res && res.ok) {
        deffer.resolve(res.data)
      } else if (res && !res.ok) {
        deffer.reject(res.error)
      } else {
        deffer.resolve()
      }
    })
    return deffer.promise;
  }
}

module.exports = FSRemote