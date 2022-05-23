# socket.io-static

Based on [socket.io-stream](https://www.npmjs.com/package/socket.io-stream).

For serving files from within a given remote directory by using [socket.io](https://socket.io/).
Both server and client of socket.io connection can access to files and folders of each other.

## Table of content

[Basic usage](#basic-usage)

[Advanced usage](#advanced-usage)

[Files](#files)

[Directories](#directories)


## Basic usage

Serving files from client to server
```js
// server.js
const path = require('path')
const http = require('http')
const express = require('express')
const { Server } = require('socket.io')
const ss = require('socket.io-static')

const local = {
  root: path.join(__dirname, 'server_files'),
}
const remote = {
  root: '/',
  socket: null,
}

const app = express()
app.use('/client/files', ss.remote.static(remote.root, () => remote.socket))
// "express.static" variant of serving local files of server.js:
app.use('/server/files', express.static(local.root))

const server = http.createServer(app)

const io = new Server(server)
io.on('connect', (socket) => {
  remote.socket = socket;
  socket.on('disconnect', () => {
    if (remote.socket === socket) {
      remote.socket = null;
    }
  })
})

server.listen(3000)
```

```js
// client.js
const path = require('path')
const { connect } = require('socket.io-client')
const ss = require('socket.io-static')

const socket = connect('ws://localhost:3000')

const local = {
  root: path.join(__dirname, 'client_files'),
}
const serveStatic = ss.io.static(local.root, { delete: true, write: true, read: true })

socket.on('connect', () => {
  // serve folder `client_files` for access from server.js side
  serveStatic(socket)
})
```

## Advanced usage

Serving files in both directions: from server to client, and vice versa

```js
// server.js
const fs = require('fs')
const path = require('path')
const ss = require('socket.io-static')
const { Server } = require('socket.io')

const local = {
  root: path.join(__dirname, 'server_files'),
}

const io = new Server()
// serve folder `server_files` for access from client.js
io.use(ss.io.static(local.root, { write: true, delete: true, read: true }))

io.on('connect', async (socket) => {
  // get access to files of remote client folder
  const remote = {
    fs: new ss.FSRemote('/', socket)
  }

  const exists = await remote.fs.exists('image.png')
  if (exists) {
    // read file from client.js side
    const localImage = fs.createWriteStream(path.join(__dirname, 'server_files/server_image.png'))
    const remoteImage = remote.fs.createReadStream('image.png')
    remoteImage.pipe(localImage).on('end', () => {
      console.log('done')
    })
  }

  // write file to client.js side
  const movie = fs.createReadStream(path.join(__dirname, 'server_files/movie.mp4'))
  const stm = remote.fs.createWriteStream('/video.mp4')
  movie.pipe(stm).on('end', () => {
    console.log('done')
  })
})

io.listen(3000)
```

```js
// client.js

const fs = require('fs')
const path = require('path')
const { connect } = require('socket.io-client')
const ss = require('socket.io-static')

const socket = connect('ws://localhost:3000')

const local = {
  root: path.join(__dirname, 'client_files'),
}
const serveStatic = ss.io.static(local.root, { delete: true, write: true, read: true })
socket.on('connect', async () => {
  // serve folder `client_files` for access from server.js
  serveStatic(socket)

  // get access to server.js files
  // here server.js folder is `path.join(__dirname, 'server_files/sub/')`
  const remote = {
    fs: new ss.FSRemote('/sub', socket),
  }

  const exists = await remote.fs.exists('photo.png')
  if (exists) {
    // download
    const photo = fs.createWriteStream(path.join(__dirname, 'client_files/photo.png'))
    remote.fs.createReadStream('photo.png').pipe(photo)
  }
})
```

## Files

### access to client.js files
```js
// server.js
app.use('/client/files', ss.remote.fs(remote.root, () => remote.socket))
```
**upload**:
```html
<!--
  Upload files to client.js side.
  "subfolder" is automatically created if it doen't exist
-->
<form method="POST" action="/client/files/subfolder">
  <input type="file" name="file_stream" placeholder="Choose file to upload">
  <br>
  <input type="submit" value="Submit" >
</form>
```
**delete**:
```bash
# Delete files or directories from client.js side
curl -X DELETE localhost:3000/client/files/subfolder/image.png
```

### access to server.js files
```js
// server.js
app.use('/server/files', ss.local.fs(local.root))
```
**upload**:
```html
<!-- Upload files to server.js side  -->
<form method="POST" action="/server/files">
  <input type="file" name="file_stream" placeholder="Choose file to upload">
  <br>
  <input type="submit" value="Submit" >
</form>
```
**delete**:
```bash
# Delete files or directories from server.js side
curl -X DELETE localhost:3000/server/files/image.png
```

## Directory

Get directory entities.

**serve client.js directories**:
```js
// server.js
app.use('/client/files', ss.remote.dir(remote.root, () => remote.socket), (req, res, next) => {
  if (!Array.isArray(req.entities)) {
    return next()
  }
  return res.json(req.entities)
})
```
**serve server.js directories**:
```js
// server.js
app.use('/server/files', ss.local.dir(local.root), (req, res, next) => {
  ...
})
```