// 纯函数：解析腾讯行情接口返回的文本、格式化数值。
// 不依赖 wx 对象，便于在 Node 中单元测试。

const CURRENCY = { sh: 'CNY', sz: 'CNY', bj: 'CNY', hk: 'HKD', us: 'USD' }
const CURRENCY_LABEL = { CNY: '元', HKD: '港元', USD: '美元' }

// 把用户输入规范化为接口代码，例如 "600519" -> "sh600519"、"aapl" -> "usAAPL"、"700" -> "hk00700"
function normalizeCode(input) {
  const s = String(input || '').trim()
  if (!s) return null
  let m = s.match(/^(sh|sz|bj)(\d{6})$/i)
  if (m) return m[1].toLowerCase() + m[2]
  m = s.match(/^hk(\d{1,5})$/i)
  if (m) return 'hk' + m[1].padStart(5, '0')
  m = s.match(/^us([a-z][a-z.\-]*)$/i)
  if (m) return 'us' + m[1].toUpperCase()
  if (/^\d{6}$/.test(s)) {
    if (/^[569]/.test(s)) return 'sh' + s
    if (/^[0123]/.test(s)) return 'sz' + s
    if (/^[48]/.test(s)) return 'bj' + s
  }
  if (/^\d{1,5}$/.test(s)) return 'hk' + s.padStart(5, '0')
  if (/^[a-z][a-z.\-]*$/i.test(s)) return 'us' + s.toUpperCase()
  return null
}

function marketOf(code) {
  return code.slice(0, 2)
}

function toNum(v) {
  if (v === undefined || v === null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// 接口按 GBK 编码返回，小程序内无法解码，股票名称可能是乱码。
// 只有名称“看起来干净”时才使用，否则返回 null 由调用方兜底。
function cleanName(name) {
  if (!name) return null
  if (/[�]/.test(name)) return null
  if (/[\u0080-ÿ]/.test(name)) return null
  return name.trim() || null
}

// 解析一条行情记录（"~" 分隔的字段数组）
// 字段含义（腾讯 qt.gtimg.cn 接口）：
//   1 名称  2 代码  3 现价  4 昨收  5 今开  30 时间
//   31 涨跌额  32 涨跌幅(%)  33 最高  34 最低  44 流通市值(亿)  45 总市值(亿)
function parseFields(code, f) {
  const price = toNum(f[3])
  if (price === null) return null
  const prevClose = toNum(f[4])
  let change = toNum(f[31])
  let changePct = toNum(f[32])
  if (change === null && prevClose) change = price - prevClose
  if (changePct === null && prevClose) changePct = (change / prevClose) * 100
  const market = marketOf(code)
  return {
    code,
    market,
    symbol: f[2] || code.slice(2),
    name: cleanName(f[1]),
    price,
    prevClose,
    open: toNum(f[5]),
    high: toNum(f[33]),
    low: toNum(f[34]),
    change,
    changePct,
    time: formatTime(f[30]),
    // 单位：亿（对应币种）
    marketCap: toNum(f[45]) || toNum(f[44]),
    currency: CURRENCY[market] || ''
  }
}

// 解析整段返回文本，可能包含多只股票：v_sh600519="...";v_hk00700="...";
function parseQuoteResponse(text) {
  const result = {}
  const re = /v_([a-zA-Z]{2}[A-Za-z0-9.\-]+)="([^"]*)"/g
  let m
  while ((m = re.exec(String(text || '')))) {
    const code = m[1]
    if (!m[2]) continue // 代码不存在时返回空串
    const quote = parseFields(code, m[2].split('~'))
    if (quote) result[code] = quote
  }
  return result
}

// 20231013150003 / 2023/10/13 16:08:00 / 2023-10-12 16:00:02 -> "2023-10-13 15:00:03"
function formatTime(raw) {
  if (!raw) return ''
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/)
  if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`
  return s.replace(/\//g, '-')
}

// 解析腾讯 smartbox 搜索结果：v_hint="sh~600519~贵州茅台~gzmt~GP-A^..."
function parseSearchResponse(text) {
  const m = String(text || '').match(/v_hint="([^"]*)"/)
  if (!m || !m[1] || m[1] === 'N') return []
  const list = []
  for (const item of m[1].split('^')) {
    const [market, rawCode, rawName, , type] = item.split('~')
    if (!CURRENCY[market] || !rawCode) continue
    let name = rawName || ''
    try {
      name = JSON.parse('"' + name.replace(/"/g, '\\"') + '"')
    } catch (e) { /* 保留原文 */ }
    const symbol = market === 'us' ? rawCode.split('.')[0].toUpperCase() : rawCode
    const code = normalizeCode(market + symbol)
    if (!code) continue
    list.push({ code, symbol, name, market, type: type || '' })
  }
  return list
}

function round(n, digits) {
  return Number(n).toFixed(digits)
}

// 市值（单位：亿）-> "2.13万亿元" / "3,456.78亿港元"
function formatMarketCap(yi, currency) {
  if (yi === null || yi === undefined) return '--'
  const unit = CURRENCY_LABEL[currency] || ''
  if (yi >= 10000) return round(yi / 10000, 2) + '万亿' + unit
  if (yi >= 1) return withCommas(round(yi, 2)) + '亿' + unit
  return withCommas(round(yi * 10000, 0)) + '万' + unit
}

function withCommas(s) {
  const [int, dec] = String(s).split('.')
  const out = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return dec ? out + '.' + dec : out
}

function formatPrice(n) {
  if (n === null || n === undefined) return '--'
  const abs = Math.abs(n)
  return round(n, abs > 0 && abs < 1 ? 3 : 2)
}

function formatChange(change, pct) {
  if (change === null || change === undefined) return { text: '--', trend: 'flat' }
  const sign = change > 0 ? '+' : ''
  const trend = change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
  const pctText = pct === null || pct === undefined ? '' : ` (${sign}${round(pct, 2)}%)`
  return { text: `${sign}${formatPrice(change)}${pctText}`, trend }
}

// 解析 K 线接口 JSON，返回 [{date, close}]
function parseKline(json, code) {
  const node = json && json.data && json.data[code]
  if (!node) return []
  const rows = node.qfqday || node.day || []
  return rows
    .map(r => ({ date: r[0], close: toNum(r[2]) }))
    .filter(r => r.close !== null)
}

module.exports = {
  normalizeCode,
  parseQuoteResponse,
  parseSearchResponse,
  parseKline,
  formatMarketCap,
  formatPrice,
  formatChange,
  formatTime
}
