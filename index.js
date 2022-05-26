const ioStatic = require('./src/io-static')
const ioStream = require('./src/io-stream')
const httpStatic = require('./src/http-static')
const { httpFSLocal, httpFSRemote } = require('./src/http-fs')
const { httpDirLocal, httpDirRemote } = require('./src/http-dir')
const { httpActionRemote, httpActionLocal } = require('./src/http-action')
const FSLocal = require('./src/fs.local')
const FSRemote = require('./src/fs.remote')
const EVENTS = require('./src/util/events')

const io = {
  static: ioStatic,
  stream: ioStream,
}
const remote = {
  fs: httpFSRemote,
  dir: httpDirRemote,
  static: httpStatic,
  action: httpActionRemote,
}
const local = {
  fs: httpFSLocal,
  dir: httpDirLocal,
  action: httpActionLocal,
}

module.exports = {
  io,
  remote,
  local,
  FSLocal,
  FSRemote,
  EVENTS,
};
