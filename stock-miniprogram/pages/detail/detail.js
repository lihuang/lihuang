const { fetchQuotes, fetchKline } = require('../../utils/api')
const { normalizeCode, formatPrice, formatChange, formatMarketCap } = require('../../utils/quote')
const storage = require('../../utils/storage')

const app = getApp()
const REFRESH_SECONDS = 10
const CHART_DAYS = 60

Page({
  data: {
    code: '',
    name: '',
    error: '',
    refreshSeconds: REFRESH_SECONDS,
    inWatchlist: false,
    hasChart: false,
    chartDays: CHART_DAYS
  },

  onLoad(options) {
    const code = normalizeCode(options.code)
    if (!code) {
      this.setData({ error: '无效的股票代码' })
      return
    }
    const name = storage.getNames()[code] || code
    this.setData({ code, name })
    wx.setNavigationBarTitle({ title: name })
    this.loadChart()
  },

  onShow() {
    if (!this.data.code) return
    this.setData({ inWatchlist: this.watchlist().includes(this.data.code) })
    this.loadQuote()
    clearInterval(this.timer)
    this.timer = setInterval(() => this.loadQuote(), REFRESH_SECONDS * 1000)
  },

  onHide() {
    clearInterval(this.timer)
  },

  onUnload() {
    clearInterval(this.timer)
  },

  onPullDownRefresh() {
    this.loadQuote().finally(() => wx.stopPullDownRefresh())
  },

  watchlist() {
    return storage.getWatchlist(app.globalData.defaultCodes)
  },

  loadQuote() {
    const { code } = this.data
    return fetchQuotes([code])
      .then(quotes => {
        const q = quotes[code]
        if (!q) {
          this.setData({ error: `未查询到 ${code} 的行情` })
          clearInterval(this.timer)
          return
        }
        const change = formatChange(q.change, q.changePct)
        const name = q.name || this.data.name
        if (q.name) storage.rememberName(code, q.name)
        if (name !== this.data.name) wx.setNavigationBarTitle({ title: name })
        this.setData({
          name,
          priceText: formatPrice(q.price),
          changeText: change.text,
          trend: change.trend,
          marketCapText: formatMarketCap(q.marketCap, q.currency),
          openText: formatPrice(q.open),
          prevCloseText: formatPrice(q.prevClose),
          highText: formatPrice(q.high),
          lowText: formatPrice(q.low),
          time: q.time
        })
      })
      .catch(err => wx.showToast({ title: err.message || '行情获取失败', icon: 'none' }))
  },

  // 走势图为附加信息，失败时静默隐藏
  loadChart() {
    fetchKline(this.data.code, CHART_DAYS)
      .then(points => {
        if (points.length < 2) return
        this.setData({
          hasChart: true,
          chartStart: points[0].date,
          chartEnd: points[points.length - 1].date
        }, () => this.drawChart(points))
      })
      .catch(() => {})
  },

  drawChart(points) {
    wx.createSelectorQuery()
      .select('#chart')
      .fields({ node: true, size: true })
      .exec(res => {
        if (!res[0] || !res[0].node) return
        const { node: canvas, width, height } = res[0]
        const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : wx.getSystemInfoSync().pixelRatio
        canvas.width = width * dpr
        canvas.height = height * dpr
        const ctx = canvas.getContext('2d')
        ctx.scale(dpr, dpr)

        const closes = points.map(p => p.close)
        const min = Math.min(...closes)
        const max = Math.max(...closes)
        const pad = 8
        const x = i => pad + (i / (closes.length - 1)) * (width - pad * 2)
        const y = v => max === min ? height / 2 : pad + (1 - (v - min) / (max - min)) * (height - pad * 2)
        const color = closes[closes.length - 1] >= closes[0] ? '#e53935' : '#1a9f5c'

        // 面积
        ctx.beginPath()
        closes.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))))
        ctx.lineTo(x(closes.length - 1), height)
        ctx.lineTo(x(0), height)
        ctx.closePath()
        const grad = ctx.createLinearGradient(0, 0, 0, height)
        grad.addColorStop(0, color + '33')
        grad.addColorStop(1, color + '00')
        ctx.fillStyle = grad
        ctx.fill()

        // 折线
        ctx.beginPath()
        closes.forEach((v, i) => (i ? ctx.lineTo(x(i), y(v)) : ctx.moveTo(x(i), y(v))))
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()

        // 最高/最低价标注
        ctx.fillStyle = '#8a8f99'
        ctx.font = '10px sans-serif'
        ctx.fillText(formatPrice(max), pad, pad + 10)
        ctx.fillText(formatPrice(min), pad, height - pad)
      })
  },

  toggleWatch() {
    const { code, inWatchlist } = this.data
    let list = this.watchlist()
    list = inWatchlist ? list.filter(c => c !== code) : list.concat(code)
    storage.setWatchlist(list)
    this.setData({ inWatchlist: !inWatchlist })
    wx.showToast({ title: inWatchlist ? '已移出自选' : '已加入自选', icon: 'success' })
  },

  onShareAppMessage() {
    return {
      title: `${this.data.name} ${this.data.priceText || ''} 市值 ${this.data.marketCapText || ''}`,
      path: `/pages/detail/detail?code=${this.data.code}`
    }
  }
})
