const FSRemote = require('./fs.remote')
const { toStreamParams, toWriteStream, toReadStream } = require('./util/helpers')

/**
 * @typedef {{ path: string; opts?: Parameters<typeof import('fs').createReadStream>[1] }} ReadableStreamParams
 * @typedef {{ path: string; opts?: Parameters<typeof import('fs').createWriteStream>[1] }} WritableStreamParams
 */

/**
 * @param {import('socket.io').Socket} socket 
 * @param {string} root
 */
function ioStream(socket, root = '/') {
  const fs = new FSRemote(root, socket)
  /**
   * @param {string | ReadableStreamParams} from
   * @param {import('stream').Writable | string | WritableStreamParams} to
   */
  function readFile(from, to) {
    from = toStreamParams(from)
    const stm = fs.createReadStream(from.path, from.opts)
    to = toWriteStream(to)
    return stm.pipe(to);
  }
  /**
   * @param {import('stream').Readable | string | ReadableStreamParams} from 
   * @param {string | WritableStreamParams} to
   */
  function sendFile(from, to) {
    to = toStreamParams(to)
    const stm = fs.createWriteStream(to.path, to.opts)
    /** @type {import('stream').Readable} */
    from = toReadStream(from)
    return from.pipe(stm)
  }

  return {
    readFile,
    sendFile,
  }
}

module.exports = ioStream;
