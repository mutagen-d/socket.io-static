const { join, normalize } = require('path')
const FSLocal = require('./fs.local')
const FSRemote = require('./fs.remote')
const { time } = require('./util/time')

/**
 * @typedef {{
 *  name: string;
 *  url: string;
 *  parent: string;
 *  size: number;
 *  isFile: boolean;
 *  isDirectory: boolean;
 *  createdAt: Date;
 * }} IDirEntity
 */

/**
 * @param {string} root
 */
function httpDirLocal(root) {
  const local = new FSLocal(root)
  return httpDir(() => local)
}

/**
 * @param {string} root
 * @param {import('socket.io').Socket} getSocket
 */
function httpDirRemote(root, getSocket) {
  return httpDir(() => {
    const socket = getSocket()
    return socket ? new FSRemote(root, socket) : undefined;
  })
}

/**
 * @param {() => (FSLocal | FSRemote)} getFS 
 * @returns {import('express').RequestHandler}
 */
function httpDir(getFS) {
  return async (req, res, next) => {
    try {
      if (req.method !== 'GET') {
        return next()
      }
      const current = getFS()
      if (!current || !current.isConnected()) {
        return next()
      }
      const exists = await current.exists(req.url)
      if (!exists) {
        return next()
      }
      const stat = await current.stat(req.url)
      const call = (target, fn) => {
        if (typeof fn === 'function') {
          return fn.call(target)
        }
        return fn;
      }

      if (!call(stat, stat.isDirectory)) {
        return next()
      }
      if (!/\/$/.test(req.originalUrl)) {
        return res.redirect(req.originalUrl + '/')
      }
      const filenames = await current.readdir(req.url, { withFileTypes: false })
      const stats = await Promise.all(filenames.map(name => current.stat(join(req.url, name))))
      const files = stats.map((stat, index) => ({
        name: filenames[index],
        url: `${req.originalUrl}/${filenames[index]}`.replace(/\/\//g, '/'),
        parent: req.url,
        size: stat.size,
        isFile: call(stat, stat.isFile),
        isDirectory: call(stat, stat.isDirectory),
        createdAt: new Date(stat.birthtime),
      })).sort((a, b) => {
        return b.createdAt.getTime() - a.createdAt.getTime()
      })
      req.entities = files;
      next()
    } catch (e) {
      console.log(time(), 'error', e)
      next()
    }
  }
}

module.exports = { httpDir, httpDirLocal, httpDirRemote }