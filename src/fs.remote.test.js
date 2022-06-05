const { describe, test, beforeAll } = require('@jest/globals');
const FSRemote = require('./fs.remote');

describe('fs.remote', () => {
  /** @type {FSRemote} */
  let FS
  beforeAll(() => {
    const socket = { connected: true }
    FS = new FSRemote('./', socket)
  })
  test('invalid path', async () => {
    const paths = ['../', '../foo/../bar', './foo/../../bar']
    const functions = ['exits', 'stat', 'unlink', 'readdir', 'mkdir', 'del', 'struct', 'createReadStream', 'createWriteStream']
    expect.assertions(paths.length * functions.length)
    const run = async (fn) => {
      try {
        await fn()
      } catch (e) {
        expect(e instanceof Error).toBe(true)
      }
    }
    await functions.reduce(async (promise, method) => {
      await promise
      return Promise.all(paths.map(value => run(() => FS[method](value))))
    }, Promise.resolve())
  })
})