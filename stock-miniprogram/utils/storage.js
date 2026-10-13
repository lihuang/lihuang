// 自选列表与名称缓存（行情接口的名称为 GBK 编码，用搜索结果里的名称兜底）
const WATCH_KEY = 'watchlist'
const NAME_KEY = 'stockNames'

function safeGet(key, fallback) {
  try {
    const v = wx.getStorageSync(key)
    return v === '' || v === undefined ? fallback : v
  } catch (e) {
    return fallback
  }
}

function getWatchlist(defaults) {
  return safeGet(WATCH_KEY, defaults.slice())
}

function setWatchlist(list) {
  wx.setStorageSync(WATCH_KEY, list)
}

function getNames() {
  return safeGet(NAME_KEY, {})
}

function rememberName(code, name) {
  if (!name) return
  const names = getNames()
  if (names[code] === name) return
  names[code] = name
  wx.setStorageSync(NAME_KEY, names)
}

module.exports = { getWatchlist, setWatchlist, getNames, rememberName }
