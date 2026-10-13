// 网络请求封装。使用前需在小程序后台「开发管理 → 服务器域名 → request 合法域名」中添加：
//   https://qt.gtimg.cn
//   https://smartbox.gtimg.cn
//   https://web.ifzq.gtimg.cn
const { parseQuoteResponse, parseSearchResponse, parseKline } = require('./quote')

function request(url) {
  return new Promise((resolve, reject) => {
    wx.request({
      url,
      method: 'GET',
      dataType: 'text',
      responseType: 'text',
      success: res => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data)
        else reject(new Error('HTTP ' + res.statusCode))
      },
      fail: err => reject(new Error(err.errMsg || '网络请求失败'))
    })
  })
}

// 批量获取实时行情，返回 { code: quote }
function fetchQuotes(codes) {
  if (!codes.length) return Promise.resolve({})
  return request('https://qt.gtimg.cn/q=' + codes.join(','))
    .then(parseQuoteResponse)
}

// 按名称 / 代码 / 拼音搜索
function searchStocks(keyword) {
  const q = encodeURIComponent(keyword)
  return request(`https://smartbox.gtimg.cn/s3/?v=2&t=all&c=1&q=${q}`)
    .then(parseSearchResponse)
}

// 最近 N 个交易日的收盘价（前复权）
function fetchKline(code, days = 60) {
  const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${code},day,,,${days},qfq`
  return request(url).then(text => {
    const json = typeof text === 'string' ? JSON.parse(text) : text
    return parseKline(json, code)
  })
}

module.exports = { fetchQuotes, searchStocks, fetchKline }
