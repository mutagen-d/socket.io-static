const { basename, join } = require('path')
const { writeFileSync, unlinkSync, mkdirSync, rmdirSync } = require('fs')
const { describe, test, beforeAll, expect, beforeEach, afterEach } = require('@jest/globals');
const FSLocal = require('./fs.local');

describe('fs.local', () => {
  const FILES = [`foo.${Date.now()}.txt`, `bar.${Date.now()}.txt`]
  const DIRS = [`goo.${Date.now()}`, `doo.${Date.now()}`]
  /** @type {FSLocal} */
  let FS
  /** @type {string} */
  let FILE_NAME
  beforeAll(() => {
    FS = new FSLocal(__dirname)
    FILE_NAME = basename(__filename)
  })
  beforeEach(() => {
    FILES.forEach(name => {
      const filepath = join(__dirname, name)
      writeFileSync(filepath, '123', 'utf-8')
    })
    DIRS.forEach(name => {
      const dirpath = join(__dirname, name)
      mkdirSync(dirpath)
    })
  })
  afterEach(() => {
    FILES.forEach(name => {
      const filepath = join(__dirname, name)
      try {
        unlinkSync(filepath)
      } catch (e) { }
    })
    DIRS.forEach((name) => {
      const dirpath = join(__dirname, name)
      try {
        rmdirSync(dirpath)
      } catch (e) { }
    })
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
  test('exists', async () => {
    const exists = await FS.exists(FILE_NAME)
    expect(exists).toBe(true)
  })
  test('stat', async () => {
    const stat = await FS.stat(FILE_NAME)
    expect(stat).not.toBeFalsy()
  })
  test('unlink', async () => {
    expect(await FS.exists(FILES[0])).toBe(true)
    await FS.unlink(FILES[0])
    expect(await FS.exists(FILES[0])).toBe(false)
  })
  test('readdir', async () => {
    const res = await FS.readdir('./')
    expect(res).toBeDefined()
  })
  test('del', async () => {
    expect(await FS.exists(DIRS[0])).toBe(true)
    await FS.del(DIRS[0])
    expect(await FS.exists(DIRS[0])).toBe(false)
  })
  test('mkdir', async () => {
    const name = 'foo.123456'
    expect(await FS.exists(name)).toBe(false)
    await FS.mkdir(name)
    expect(await FS.exists(name)).toBe(true)
    await FS.del(name)
  })
})