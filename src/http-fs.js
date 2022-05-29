const debug = require('debug')('socket.io-static:fs')
const { normalize, join, basename } = require('path')
const busboy = require('busboy')
const got = require('got')
const FSLocal = require('./fs.local')
const FSRemote = require('./fs.remote')
const { isup } = require('./util/path')
const devNull = require('./util/devNull')
const { parseUrl } = require('./util/parseurl')

/**
 * @param {string} root
 * @param {() => import('socket.io').Socket} getSocket 
 */
function httpFSRemote(root, getSocket) {
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
  return httpFS(() => {
    const socket = getSocket()
    return socket ? new FSRemote(root, socket) : undefined
  })
}
/**
 * @param {string} root
 */
function httpFSLocal(root) {
  if (!root) {
    throw new Error('root must not be empty')
  }
  root = normalize(root)
  if (isup(root)) {
    throw new Error('invalid root')
  }
  const local = new FSLocal(root)
  return httpFS(() => local)
}

/**
 * @param {() => FSLocal | FSRemote} getFS
 */
function httpFS(getFS) {
  const _1Mb = 1024 * 1024;
  const _1Gb = 1024 * _1Mb;
  /**
   * @param {import('express').Request} req
   * @param {FSLocal | FSRemote} fs
   * @param {{ url: string; name?: string; }} file 
   * @returns {import('fs').WriteStream | undefined}
   */
  const downloadFile = (req, fs, file) => {
    if (file.url) {
      const url = new URL(file.url)
      const filename = file.name || (url.pathname && url.pathname !== '/') ? basename(file.name || url.pathname) : undefined
      if (filename) {
        const { pathname } = parseUrl(req.url)
        const filepath = join(pathname, filename)
        const stream = fs.createWriteStream(filepath)
        debug('uploading file "%s" to remote path "%s" from url "%s"', filename, filepath, url.href)
        return got.stream(file.url).pipe(stream)
      } else {
        debug('warning! filename for url "%s" not set', url.href)
      }
    }
  }
  /**
   * 
   * @param {import('express').Request} req
   * @param {FSLocal | FSRemote} fs
   * @param {{ name?: string; }} dir
   */
  const createDirectory = async (req, fs, dir) => {
    if (dir.name && !isup(dir.name)) {
      const { pathname } = parseUrl(req.url)
      const dirpath = join(pathname, normalize(dir.name))
      debug('creating remote directory "%s"', dirpath)
      await fs.mkdir(dirpath, { recursive: true })
    }
  }
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {FSLocal | FSRemote} fs 
   */
  const onFormData = async (req, res, fs) => {
    const { pathname } = parseUrl(req.url)
    if (!await fs.exists(pathname)) {
      await fs.mkdir(pathname, { recursive: true })
    }
    const stat = await fs.stat(pathname)
    const call = (target, fn) => typeof fn === 'function' ? fn.call(target) : fn;
    if (!call(stat, stat.isDirectory)) {
      return res.status(403).send('NOT ALLOWED');
    }
    const bb = busboy({ headers: req.headers, limits: { files: 1, fileSize: _1Gb } })
    bb.on('file', (name, file, info) => {
      try {
        const filename = info.filename ? basename(info.filename) : undefined;
        if (!filename) {
          return file.pipe(devNull, { end: false })
        }
        const filepath = join(pathname, filename)
        const stream = fs.createWriteStream(filepath)
        file.pipe(stream)
        debug('uploading file "%s" to remote path "%s"', filename, filepath)
      } catch (e) {
        debug('error', e)
      }
    })
    /** @type {{ url: string; name: string; }} */
    const file = {}
    /** @type {{ name: string }} */
    const dir = {}
    bb.on('field', (name, value, info) => {
      switch (name) {
        case 'file_url':
          file.url = value;
          break;
        case 'file_name':
          file.name = value;
          break;
        case 'dir_name':
          dir.name = value;
          break;
      }
    })
    bb.on('error', (e) => {
      debug('error', e)
      res.status(400).send('FAIL')
    })
    bb.on('close', async () => {
      try {
        downloadFile(req, fs, file)
        await createDirectory(req, fs, dir)
        res.send('OK')
      } catch (e) {
        debug('error', e)
        res.status(400).send('FAIL: ' + e.message)
      }
    })
    return req.pipe(bb)
  }
  /**
   * 
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   * @param {FSLocal | FSRemote} fs
   */
  const onJSON = async (req, res, next, fs) => {
    if (req.body) {
      const { file_name, file_url, dir_name } = req.body;
      downloadFile(req, fs, { url: file_url, name: file_name })
      await createDirectory(req, fs, { name: dir_name })
      if ((dir_name && !isup(dir_name)) || file_url) {
        return res.send('OK')
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

      const contentType = req.headers['content-type'] || ''
      switch (req.method) {
        case 'DELETE':
          if (!await fs.exists(pathname)) {
            return next()
          }
          debug('deleting file "%s"', pathname)
          await fs.del(pathname)
          return res.send('OK');
        case 'POST':
          if (/multipart\/form\-data/i.test(contentType)) {
            await onFormData(req, res, fs)
            return;
          }
          if (/application\/(?:json|x\-www\-form\-urlencoded)/i.test(contentType)) {
            await onJSON(req, res, next, fs)
            return;
          }
          return next()
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

module.exports = { httpFSRemote, httpFSLocal, httpFS };

