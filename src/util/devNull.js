const { Writable } = require('stream')

const devNull = new Writable()
devNull._write = function (chunk, enc, next) {
  next()
}

module.exports = devNull;