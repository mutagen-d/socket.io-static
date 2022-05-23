const fs = require('fs')
const { join, normalize } = require('path')
const del = require('del')
const { isup } = require('./util/path')

/**
 * @typedef {import('fs').ObjectEncodingOptions} ObjectEncodingOptions
 * @typedef { | (ObjectEncodingOptions & { withFileTypes?: false })
 * | BufferEncoding
 * | null
 * | undefined
 * | 'buffer'
 * | { encoding: 'buffer'; withFileTypes?: false }
 * | (ObjectEncodingOptions & { withFileTypes: true })
 * } ReaddirOptions
 */

/**
 * @template T
 * @typedef {T extends ('buffer' | { encoding: 'buffer' })
 * ? Buffer[]
 * : T extends { withFileTypes: true }
 * ? import('fs').Dirent[]
 * : T extends (BufferEncoding | { encoding: BufferEncoding } | undefined | null | { withFileTypes: (false | undefined) })
 * ? string[]
 * : string[] | Buffer[]
 * } ReaddirResult
 */

/**
 * @typedef {{
 *  name: string;
 *  isDirectory: false
 * }} FileLike
 */
/**
 * @typedef {{
 *  name: string;
 *  isDirectory: true;
 *  files: (FileLike | DirLike)[]
 * }} DirLike
 */

/**
* @template P
* @typedef {(path: string, opts?: Extract<P, ReaddirOptions>) => Promise<ReaddirResult<P>>} Readdir
*/

class FSLocal {
  /** @param {string} root */
  constructor(root) {
    /** @readonly */
    this.root = normalize(root);

    this.stat = this.stat.bind(this)
    this.readdir = this.readdir.bind(this)
    this.del = this.del.bind(this)
    this.exists = this.exists.bind(this)
    this.struct = this.struct.bind(this)
    this.mkdir = this.mkdir.bind(this)
    this.isConnected = this.isConnected.bind(this)
  }

  isConnected() {
    return true;
  }

  /** @param {string} path */
  async exists(path) {
    path = this.path(path)
    return fs.promises.stat(path).then(() => true).catch(() => false)
  }

  /** @param {Parameters<typeof fs.promises.stat>} args */
  async stat(...args) {
    args[0] = this.path(args[0])
    return fs.promises.stat(...args)
  }

  /** @param {string} path */
  async unlink(path) {
    path = this.path(path)
    return fs.promises.unlink(path)
  }

  /**
   * @template P
   * @param {string} path
   * @param {Extract<P, ReaddirOptions>} opts
   * @returns {Promise<ReaddirResult<P>>}
   */
  async readdir(path, opts) {
    path = this.path(path)
    return fs.promises.readdir(path, opts)
  }

  /** @param {Parameters<typeof del>} args */
  async del(...args) {
    args[0] = this.path(args[0])
    return del(...args);
  }

  /** @param {Parameters<typeof fs.promises.mkdir>} args */
  async mkdir(...args) {
    args[0] = this.path(args[0])
    return fs.promises.mkdir(...args)
  }

  /**
   * @param {string} path
   * @return {Promise<(DirLike | FileLike)[]>}
   */
  async struct(path) {
    const stat = await this.stat(path)
    if (!stat.isDirectory()) {
      return [];
    }
    const files = await this.readdir(path, { withFileTypes: true })
    const promises = files.map(async (file) => {
      if (file.isDirectory()) {
        return {
          name: file.name,
          isDirectory: true,
          files: await this.struct(join(path, file.name))
        }
      }
      return { name: file.name, isDirectory: false }
    })
    return Promise.all(promises)
  }

  /** @param {Parameters<typeof fs.createWriteStream>} args */
  createWriteStream(...args) {
    const path = this.path(args[0])
    return fs.createWriteStream(path, args[1])
  }

  /** @param {Parameters<typeof fs.createReadStream>} args */
  createReadStream(...args) {
    const path = this.path(args[0])
    return fs.createReadStream(path, args[1])
  }

  /**
   * @private
   * @param {string} path
   */
  path(path) {
    if (isup(path)) {
      throw new Error(`malicious path: ${path}`)
    }
    return join(this.root, normalize(path))
  }
}

module.exports = FSLocal