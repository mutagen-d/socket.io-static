/** @type {{ [url: string]: URL }} */
const cache = {}

/** @param {string} url */
const parseUrl = (url) => {
  if (!cache[url]) {
    cache[url] = new URL(url, 'http://localhost')
  }
  return cache[url]
}

module.exports = { parseUrl }
