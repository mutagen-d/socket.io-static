const fs = require('fs')

/**
 * @typedef {{ path: string; opts?: Parameters<typeof import('fs').createReadStream>[1] }} ReadableStreamParams
 * @typedef {{ path: string; opts?: Parameters<typeof import('fs').createWriteStream>[1] }} WritableStreamParams
 */

/**
 * @param {import('stream').Readable | string | ReadableStreamParams} value 
 * @return {import('stream').Readable}
 */
function toReadStream(value) {
  if (typeof value === 'string') {
    return fs.createReadStream(value)
  } else if (value && typeof value.path === 'string') {
    return fs.createReadStream(value.path, value.opts)
  } else {
    return value;
  }
}
/**
 * @param {import('stream').Writable | string | WritableStreamParams} value 
 * @return {import('stream').Writable}
 */
function toWriteStream(value) {
  if (typeof value === 'string') {
    return fs.createWriteStream(value)
  } else if (value && typeof value.path === 'string') {
    return fs.createWriteStream(value.path, value.opts)
  } else {
    return value;
  }
}

/**
 * @template T
 * @param {string | Extract<T, { path: string }>} value
 * @return {Extract<T, { path: string }>}
 */
function toStreamParams(value) {
  if (typeof value === 'string') {
    return { path: value }
  } else if (value && typeof value.path === 'string') {
    return value;
  }
  return value;
}

module.exports = {
  toReadStream,
  toWriteStream,
  toStreamParams,
};
