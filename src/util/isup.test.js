const { describe, test, expect } = require('@jest/globals')
const { isup } = require('./isup')

describe('isup', () => {
  test('true', () => {
    const paths = ['../', '..', './foo/../../foo']
    paths.forEach((val) => {
      expect(isup(val)).toBe(true)
    })
  })
  test('false', () => {
    const paths = ['./foo', './bar/../', './']
    paths.forEach((val) => {
      expect(isup(val)).toBe(false)
    })
  })
})