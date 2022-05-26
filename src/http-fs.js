const { normalize, join, basename } = require('path')
const busboy = require('busboy')
const got = require('got')
const { time } = require('./util/time')
const FSLocal = require('./fs.local')
const FSRemote = require('./fs.remote')
const { isup } = require('./util/path')
const devNull = require('./util/devNull')

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
        const stream = fs.createWriteStream(join(req.url, filename))
        return got.stream(file.url).pipe(stream)
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
      await fs.mkdir(join(req.url, normalize(dir.name)), { recursive: true })
    }
  }
  /**
   * @param {import('express').Request} req
   * @param {import('express').Response} res
   * @param {FSLocal | FSRemote} fs 
   */
  const onFormData = async (req, res, fs) => {
    if (!await fs.exists(req.url)) {
      await fs.mkdir(req.url, { recursive: true })
    }
    const stat = await fs.stat(req.url)
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
        const stream = fs.createWriteStream(join(req.url, filename))
        file.pipe(stream)
      } catch (e) {
        console.log(time(), 'error', e)
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
      console.log(time(), 'error', e)
      res.status(400).send('FAIL')
    })
    bb.on('close', async () => {
      try {
        downloadFile(req, fs, file)
        await createDirectory(req, fs, dir)
        res.send('OK')
      } catch (e) {
        console.log(time(), 'error', e)
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
      if (isup(req.url)) {
        return next()
      }
      const current = getFS()
      if (!current || !current.isConnected()) {
        return next();
      }

      const contentType = req.headers['content-type'] || ''
      switch (req.method) {
        case 'DELETE':
          if (!await current.exists(req.url)) {
            return next()
          }
          await current.del(req.url)
          return res.send('OK');
        case 'POST':
          if (/multipart\/form\-data/i.test(contentType)) {
            await onFormData(req, res, current)
            return;
          }
          if (/application\/(?:json|x\-www\-form\-urlencoded)/i.test(contentType)) {
            await onJSON(req, res, next, current)
            return;
          }
          return next()
        default:
          return next()
      }
    } catch (e) {
      console.log(time(), 'error', e)
      return next()
    }
  }
  return onRequest;
}

module.exports = { httpFSRemote, httpFSLocal, httpFS };

