# socket.io-static

Based on [socket.io-stream](https://www.npmjs.com/package/socket.io-stream).

For serving files from within a given remote directory by using [socket.io](https://socket.io/).
Both server and client of socket.io connection can access to files and folders of each other.

## Table of content

[API](#api)

[Basic usage](#basic-usage)

[Advanced usage](#advanced-usage)

## API

```js
const ss = require('socket.io-static')
```

### ss.io.static(root [, permissions])

serving `root` folder's files

```js
// on client.js:
ss.io.static(root)(socket)
// or on server.js:
io.use(ss.io.static(root))
```

- `root` - root folder
- `permissions` - access permissions: defaults `{ write: true, read: true, delete: false }`
- returns socket.io `middleware`

### ss.remote.static(root, getSocket)

serving remote folder's files

```js
app.use('/client/files', ss.remote.static('/', () => socket))
```

- `root` - subfolder path of remote folder
- `getSocket` - function returning socket object `() => import('socket.io').Socket`
- returns express.js `middleware`

### ss.remote.fs(root, getSocket)

create, delete remote folder's files and directories

```js
app.use('/client/files', ss.remote.fs('/', () => socket))
```

- `root` - subfolder path of remote folder
- `getSocket` - function returning socket object `() => import('socket.io').Socket`
- returns express.js `middleware`

create file

```html
<!-- Upload files -->
<form method="POST" action="/client/files/subfolder/">
  <input type="file" name="file" placeholder="Choose file to upload" />
  <br />
  <input type="submit" value="Submit" />
</form>
```

delete file or directory

```sh
curl -X DELETE localhost:3000/client/files/image.png
curl -X DELETE localhost:3000/client/files/subfoler/
```

create directory
```sh
curl -X POST -H 'Content-Type: application/json' -d '{ "dir_name": "/foo/bar" }' localhost:3000/client/files/
```

upload file by url
```sh
curl -X POST -H 'Content-Type: application/json' -d '{ "file_url": "https://example.com/file.png", "file_name": "image.png" }' localhost:3000/client/files/
```

### ss.remote.dir(root, getSocket)

get remote directory entities

```js
app.use('/client/files', ss.remote.dir(root, () => socket), (req, res, next) => {
  // if directory not found, entities is undefined
  if (!req.entities) {
    return next()
  }
  res.json(req.entities)
})
```

- `root` - subfolder path of remote folder
- `getSocket` - function returning socket object `() => import('socket.io').Socket`
- returns express.js `middleware`

e.i.

```sh
curl localhost:3000/client/files/subfolder
```

### ss.remote.action(root, getSocket, actions)

handle arbitrary `actions`

- `root` - subfolder path of remote folder
- `getSocket` - function returning socket object `() => import('socket.io').Socket`
- `actions` - allowed action list
- returns express.js `middleware`

```js
// server.js
app.use('/client/files', ss.remote.action(root, () => socket, ['do_smth']))
```
```js
// client.js
socket.on(ss.EVENTS.ACTION, (action, path, ...args) => {
  if (action === 'do_smth') {
    // do something
  }
})
```
usage
```sh
curl -X POST -H 'Content-Type: application/json' -d '{ "action": "do_smth", args: [] }' localhost:3000/client/files/image.png
```

### new FSRemote(root, socket [, timeout])

create remote file system object

- `root` - subfolder path of remote folder
- `socket` - socket.io `Socket` instance
- `timeout` - acknowledgement timeout (default, 10 sec)

| Method                             | Return value              | Description               |
| ---------------------------------- | ------------------------- | ------------------------- |
| `isConnected()`                    | `boolean`                 | is socket connected       |
| `exists(path)`                     | `Promise<boolean>`        | if entity exists          |
| `stat(path [, opts])`              | `Promise<Stats>`          | get entity's stat         |
| `readdir(path [, opts])`           | `Promise<ReaddirResults>` | get dir entities          |
| `del(path [, opts])`               | `Promise<string[]>`       | delete entity             |
| `mkdir(path [, opts])`             | `Promise<string>`         | create directory          |
| `struct(path)`                     | `Promise<StructResult>`   | get full structure of dir |
| `createWriteStream(path [, opts])` | `Promise<WriteStream>`    |                           |
| `createReadStream(path [, opts])`  | `Promise<ReadStream>`     |                           |

### new FSLocal(root [, emitter])

create local file system object

- `root` - root folder
- `emitter` - event emitter which implements `{ emit: (...args) => any; hasListeners: (event) => boolean }` interface

methods are same as for `FSRemote` object

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
// serving client.js files:
app.use('/client/files', ss.remote.static(remote.root, () => remote.socket))
// "express.static" variant of serving local files of server.js:
app.use('/server/files', express.static(local.root))

const server = http.createServer(app)

const io = new Server(server)
io.on('connect', (socket) => {
  remote.socket = socket
  socket.on('disconnect', () => {
    if (remote.socket === socket) {
      remote.socket = null
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
    fs: new ss.FSRemote('/', socket),
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