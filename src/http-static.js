const debug = require('debug')('socket.io-static:static')
const { normalize, join } = require('path')
const parseRange = require('range-parser')
const mime = require('mime')
const { isup } = require('./util/path');
const FSRemote = require('./fs.remote');
const { parseUrl } = require('./util/parseurl');

/**
 * @typedef {{
 *  index?: boolean | string[]
 * }} IHttpStaticOptions
 */

/**
 * @typedef {import('fs').Stats} Stats
 * @typedef {import('./util/tranform').IFunToRetVal<Stats>} TStats
 */

/**
 * @param {string} root
 * @param {() => import('socket.io').Socket} getSocket
 * @param {IHttpStaticOptions} [options]
 */
function httpStatic(root, getSocket, options) {
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
  /** @type {IHttpStaticOptions} */
  const opts = Object.assign({}, options || null)
  const index = Array.isArray(opts.index)
    ? opts.index
    : typeof opts.index === 'string'
      ? [opts.index]
      : opts.index === false
        ? []
        : ['index.html']
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {Stats | TStats} stat
   * @param {string} [idx]
   */
  function setHeaders(req, res, stat, idx) {
    const url = parseUrl(req.url).pathname
    res.setHeader('Accept-Ranges', 'bytes')
    const type = mime.lookup(idx || url)
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
  const call = (target, fn) => typeof fn === 'function' ? fn.call(target) : fn
  /**
   * @param {import('express').Request} req 
   * @param {FSRemote} fs 
   * @returns {Promise<{ stat?: Stats | TStats; index?: string } | null>}
   */
  const getStats = async (req, fs) => {
    const { pathname } = parseUrl(req.url)
    /** @type {Stats | TStats} */
    const stat = await fs.stat(pathname).catch(() => null);
    if (!stat) {
      return { stat: null };
    }
    if (call(stat, stat.isFile)) {
      return { stat }
    }
    if (index.length && call(stat, stat.isDirectory)) {
      /** @type {(Stats | TStats)[]} */
      const stats = await Promise.all(index.map(name => fs.stat(join(pathname, name)).catch(() => null)))
      if (!stats.every(Boolean)) {
        return next()
      }
      const idx = stats.findIndex(idx => idx && call(idx, idx.isFile))
      if (idx !== -1) {
        return { stat: stats[idx], index: index[idx] }
      }
    }
    return { stat: null };
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
      if (req.method !== 'HEAD' && req.method !== 'GET') {
        return next();
      }
      const socket = getSocket()
      if (!socket) {
        return next();
      }
      const remote = new FSRemote(root, socket)
      const { stat, index: idx } = await getStats(req, remote)
      if (!stat) {
        return next()
      }
      if (!call(stat, stat.isFile)) {
        return next()
      }
      switch (req.method) {
        case 'HEAD':
          setHeaders(req, res, stat, idx)
          return res.end();
        case 'GET':
          const opts = setHeaders(req, res, stat, idx)
          const path = idx ? join(pathname, idx) : pathname;
          const stream = remote.createReadStream(path, opts)
          stream.pipe(res)
          debug('reading file from remote path "%s"', path)
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
