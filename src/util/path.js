const { normalize, sep } = require('path')

const UP_PATH_REGEXP = /(?:^|[\\/])\.\.(?:[\\/]|$)/
/**
 * @param {string} path
 */
const isup = (path) => {
  path = normalize('.' + sep + path)
  return UP_PATH_REGEXP.test(path)
}

module.exports = {
  isup,
}