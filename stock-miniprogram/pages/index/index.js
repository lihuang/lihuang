const { fetchQuotes, searchStocks } = require('../../utils/api')
const { normalizeCode, formatPrice, formatChange, formatMarketCap } = require('../../utils/quote')
const storage = require('../../utils/storage')

const app = getApp()

Page({
  data: {
    keyword: '',
    results: [],
    searched: false,
    list: [],
    updatedAt: ''
  },

  onShow() {
    this.refresh()
  },

  onPullDownRefresh() {
    this.refresh().finally(() => wx.stopPullDownRefresh())
  },

  refresh() {
    const codes = storage.getWatchlist(app.globalData.defaultCodes)
    const names = storage.getNames()
    return fetchQuotes(codes)
      .then(quotes => {
        const list = codes.map(code => {
          const q = quotes[code]
          const name = (q && q.name) || names[code] || code
          if (!q) {
            return { code, name, priceText: '--', changeText: '--', trend: 'flat', marketCapText: '--' }
          }
          const change = formatChange(q.change, q.changePct)
          return {
            code,
            name,
            priceText: formatPrice(q.price),
            changeText: change.text,
            trend: change.trend,
            marketCapText: formatMarketCap(q.marketCap, q.currency)
          }
        })
        const now = new Date()
        const pad = n => String(n).padStart(2, '0')
        this.setData({ list, updatedAt: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}` })
      })
      .catch(err => wx.showToast({ title: err.message || '行情获取失败', icon: 'none' }))
  },

  onInput(e) {
    this.setData({ keyword: e.detail.value })
  },

  onSearch() {
    const keyword = this.data.keyword.trim()
    if (!keyword) {
      this.setData({ results: [], searched: false })
      return
    }
    wx.showLoading({ title: '搜索中' })
    searchStocks(keyword)
      .then(results => {
        // 搜索无结果但输入本身是合法代码时，直接跳转详情
        const code = normalizeCode(keyword)
        if (!results.length && code) {
          this.goDetail(code, '')
          return
        }
        results.forEach(r => storage.rememberName(r.code, r.name))
        this.setData({ results: results.slice(0, 10), searched: true })
      })
      .catch(err => wx.showToast({ title: err.message || '搜索失败', icon: 'none' }))
      .finally(() => wx.hideLoading())
  },

  openDetail(e) {
    const { code, name } = e.currentTarget.dataset
    this.goDetail(code, name)
  },

  goDetail(code, name) {
    if (name && name !== code) storage.rememberName(code, name)
    wx.navigateTo({ url: `/pages/detail/detail?code=${code}` })
  },

  onRemove(e) {
    const { code, name } = e.currentTarget.dataset
    wx.showModal({
      title: '删除自选',
      content: `确定将 ${name} 移出自选？`,
      success: res => {
        if (!res.confirm) return
        const list = storage.getWatchlist(app.globalData.defaultCodes).filter(c => c !== code)
        storage.setWatchlist(list)
        this.refresh()
      }
    })
  },

  onShareAppMessage() {
    return { title: '股价与市值速查', path: '/pages/index/index' }
  }
})
