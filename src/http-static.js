const debug = require('debug')('socket.io-static:static')
const { normalize } = require('path')
const parseRange = require('range-parser')
const mime = require('mime')
const { isup } = require('./util/path');
const FSRemote = require('./fs.remote');

/**
 * @param {string} root
 * @param {() => import('socket.io').Socket} getSocket
 */
function httpStatic(root, getSocket) {
  if (!root) {
    throw new Error('root path must not be empty')
  }
  if (!getSocket || typeof getSocket !== 'function') {
    throw new Error('getSocket must not be empty')
  }
  root = normalize(root)
  if (isup(root)) {
    throw new Error('invalid root path')
  }
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('./util/tranform').IFunToRetVal<import('fs').Stats>} stat
   */
  function setHeaders(req, res, stat) {
    res.setHeader('Accept-Ranges', 'bytes')
    const type = mime.lookup(req.url)
    if (type) {
      const charset = mime.charsets.lookup(type)
      res.setHeader('Content-Type', type + (charset ? '; charset=' + charset : ''))
    }
    /** @type {import('./methods').ReadableStreamParams['opts']} */
    const opts = {}
    if (!req.headers.range) {
      res.setHeader('Content-Length', stat.size)
      res.statusCode = 200
    } else {
      const ranges = parseRange(stat.size, req.headers.range)
      if (ranges === -1 || ranges === -2) {
        res.setHeader('Content-Length', stat.size)
        res.statusCode = 200
      } else {
        opts.start = ranges[0].start;
        opts.end = ranges[0].end;
        res.setHeader('Content-Length', opts.end - opts.start + 1)
        res.setHeader('Content-Range', `bytes ${opts.start}-${opts.end}/${stat.size}`)
        res.statusCode = 206
      }
    }
    return opts;
  }
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  async function onRequest(req, res, next) {
    try {
      if (isup(req.url)) {
        return next()
      }
      const socket = getSocket()
      if (!socket) {
        return next();
      }
      const remote = new FSRemote(root, socket)
      const exists = await remote.exists(req.url)
      if (!exists) {
        return next();
      }
      const stat = await remote.stat(req.url)
      const call = (target, fn) => typeof fn === 'function' ? fn.call(target) : fn
      if (!call(stat, stat.isFile)) {
        return next()
      }
      switch (req.method) {
        case 'HEAD':
          setHeaders(req, res, stat)
          return res.end();
        case 'GET':
          const opts = setHeaders(req, res, stat)
          const stream = remote.createReadStream(req.url, opts)
          stream.pipe(res)
          debug('reading file from remote path "%s"', req.url)
          return
        default:
          return next()
      }
    } catch (e) {
      debug('error', e)
      return next()
    }
  }
  return onRequest;
}

module.exports = httpStatic
