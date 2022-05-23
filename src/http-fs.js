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

      switch (req.method) {
        case 'DELETE':
          if (!await current.exists(req.url)) {
            return next()
          }
          await current.del(req.url)
          return res.send('OK');
        case 'POST':
          if (!await current.exists(req.url)) {
            await current.mkdir(req.url, { recursive: true })
          }
          const stat = await current.stat(req.url)
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
              const stream = current.createWriteStream(join(req.url, filename))
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
              if (file.url) {
                const filename = basename(file.name || new URL(file.url).pathname)
                const stream = current.createWriteStream(join(req.url, filename))
                got.stream(file.url).pipe(stream)
              }
              if (dir.name) {
                await current.mkdir(join(req.url, normalize(dir.name)), { recursive: true })
              }
              res.send('OK')
            } catch (e) {
              console.log(time(), 'error', e)
              res.status(400).send('FAIL: ' + e.message)
            }
          })
          return req.pipe(bb)
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

