const debug = require('debug')('socket.io-static:action')
const { normalize } = require('path')
const FSLocal = require('./fs.local')
const FSRemote = require('./fs.remote')
const { parseUrl } = require('./util/parseurl')
const { isup } = require('./util/path')

/**
 * @template T
 * @typedef {Extract<T, { emit: (...any: args) => any; hasListeners: (event: string) => boolean }>} Emitter
 */

/**
 * ```js
 * // server.js
 * const ss = require('socket.io-static')
 * const express = require('express')
 * const app = express()
 * app.use(express.json())
 * app.use(express.urlencoded())
 * app.use('/remote/files', ss.remote.action('/', () => socket, ['do_smth']))
 * 
 * // client.js
 * const { join } = require('path')
 * const { connect } = require('socket.io-client')
 * const ss = require('socket.io-static')
 * const socket = connect('ws://localhost:3000')
 * const root = join(__dirname, 'static')
 * socket.on('connect', () => {
 *   ss.io.static(root)(socket)
 * })
 * const local = new ss.FSLocal(root)
 * socket.on(ss.EVENTS.ACTION, (action, path, ...args) => {
 *   const fullpath = local.path(path)
 *   if (action === 'do_smth') {
 *     // do something
 *   }
 * })
 * ```
 * @param {string} root
 * @param {() => import('socket.io').Socket} getSocket 
 * @param {string[]} actions
 */
function httpActionRemote(root, getSocket, actions) {
  if (!root) {
    throw new Error('root must not be empty')
  }
  if (typeof getSocket !== 'function') {
    throw new Error('getSocket must be a function')
  }
  root = normalize(root)
  if (isup(root)) {
    throw new Error('invalid root')
  }
  return httpAction(() => {
    const socket = getSocket()
    return socket ? new FSRemote(root, socket) : undefined
  }, actions)
}
/**
 * ```js
 * const { join } = require('path')
 * const ss = require('socket.io-static')
 * const express = require('express')
 * const { EventEmitter2 } = require('eventemitter2')
 * 
 * const app = express()
 * const emitter = new EventEmitter2()
 * 
 * const root = join(__dirname, 'static')
 * app.use(express.json())
 * app.use(express.urlencoded())
 * app.use('/local/files', ss.local.action(root, emitter, ['do_smth']))
 * 
 * emitter.on(ss.EVENTS.ACTION, (action, fullpath, ...args) => {
 *    if (action === 'do_smth') {
 *      // do something
 *    }
 * })
 * ```
 * @template T
 * @param {string} root
 * @param {Emitter<T>} emitter
 * @param {string[]} actions
 * 
 */
function httpActionLocal(root, emitter, actions) {
  if (!root) {
    throw new Error('root must not be empty')
  }
  root = normalize(root)
  if (isup(root)) {
    throw new Error('invalid root')
  }
  const local = new FSLocal(root, emitter)
  return httpAction(() => local, actions)
}

/**
 * @param {() => FSLocal | FSRemote} getFS
 * @param {string[]} actions
 */
function httpAction(getFS, actions) {
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @param {FSLocal | FSRemote} fs
   */
  const onJSON = (req, res, next, fs) => {
    if (req.body && req.body.action) {
      const { action, args = [] } = req.body
      if (!actions.includes(action)) {
        debug('Warning! invalid action "%s"', action)
        return next()
      }
      const { pathname } = parseUrl(req.url)
      debug('Action "%s" on %s path "%s"', action, fs.type, pathname)
      if (fs.emitter) {
        fs.action(action, pathname, ...args)
        return res.send('OK')
      } else {
        debug('Warning! action emitter not set, skipping')
      }
    }
    return next()
  }
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async function onRequest(req, res, next) {
    try {
      const { pathname } = parseUrl(req.url)
      if (isup(pathname)) {
        return next()
      }
      const fs = getFS()
      if (!fs || !fs.isConnected()) {
        return next();
      }
      if (req.method !== 'POST') {
        return next()
      }
      const exists = await fs.exists(pathname)
      if (!exists) {
        return next()
      }
      onJSON(req, res, next, fs)
    } catch (e) {
      debug('error', e)
      return next()
    }
  }
  return onRequest;
}

module.exports = { httpAction, httpActionLocal, httpActionRemote };

