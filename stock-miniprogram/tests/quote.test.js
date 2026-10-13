// 运行：node tests/quote.test.js
const assert = require('assert')
const q = require('../utils/quote')

function fields(overrides) {
  const f = new Array(50).fill('')
  Object.entries(overrides).forEach(([i, v]) => { f[i] = v })
  return f.join('~')
}

const tests = {
  'normalizeCode 识别各市场代码'() {
    assert.strictEqual(q.normalizeCode('600519'), 'sh600519')
    assert.strictEqual(q.normalizeCode('000001'), 'sz000001')
    assert.strictEqual(q.normalizeCode('300750'), 'sz300750')
    assert.strictEqual(q.normalizeCode('830799'), 'bj830799')
    assert.strictEqual(q.normalizeCode('SH600519'), 'sh600519')
    assert.strictEqual(q.normalizeCode('700'), 'hk00700')
    assert.strictEqual(q.normalizeCode('hk9988'), 'hk09988')
    assert.strictEqual(q.normalizeCode('aapl'), 'usAAPL')
    assert.strictEqual(q.normalizeCode('usBRK.B'), 'usBRK.B')
    assert.strictEqual(q.normalizeCode(''), null)
    assert.strictEqual(q.normalizeCode('茅台'), null)
  },

  'parseQuoteResponse 解析多只股票'() {
    const text =
      `v_sh600519="${fields({ 1: '贵州茅台', 2: '600519', 3: '1700.50', 4: '1690.00', 5: '1695.00', 30: '20261013150003', 31: '10.50', 32: '0.62', 33: '1710.00', 34: '1688.00', 44: '21362.10', 45: '21362.10' })}";\n` +
      `v_usAAPL="${fields({ 1: '苹果', 2: 'AAPL.OQ', 3: '230.10', 4: '232.00', 30: '2026-10-12 16:00:02', 31: '-1.90', 32: '-0.82', 45: '34567.8' })}";\n` +
      `v_hk99999="";`
    const r = q.parseQuoteResponse(text)
    assert.deepStrictEqual(Object.keys(r), ['sh600519', 'usAAPL'])
    const m = r.sh600519
    assert.strictEqual(m.name, '贵州茅台')
    assert.strictEqual(m.price, 1700.5)
    assert.strictEqual(m.change, 10.5)
    assert.strictEqual(m.changePct, 0.62)
    assert.strictEqual(m.marketCap, 21362.1)
    assert.strictEqual(m.currency, 'CNY')
    assert.strictEqual(m.time, '2026-10-13 15:00:03')
    assert.strictEqual(r.usAAPL.currency, 'USD')
    assert.strictEqual(r.usAAPL.change, -1.9)
  },

  'parseQuoteResponse 缺少涨跌字段时按昨收计算'() {
    const r = q.parseQuoteResponse(`v_hk00700="${fields({ 3: '110', 4: '100', 44: '9000' })}"`)
    assert.strictEqual(r.hk00700.change, 10)
    assert.strictEqual(r.hk00700.changePct, 10)
    assert.strictEqual(r.hk00700.marketCap, 9000)
    assert.strictEqual(r.hk00700.currency, 'HKD')
  },

  'GBK 乱码名称被丢弃'() {
    const r = q.parseQuoteResponse(`v_sh600519="${fields({ 1: '��', 3: '1' })}"`)
    assert.strictEqual(r.sh600519.name, null)
    const r2 = q.parseQuoteResponse(`v_sh600519="${fields({ 1: 'ÙóÖÝ', 3: '1' })}"`)
    assert.strictEqual(r2.sh600519.name, null)
  },

  'parseSearchResponse 解码名称并转换代码'() {
    const text = 'v_hint="sh~600519~\\u8d35\\u5dde\\u8305\\u53f0~gzmt~GP-A^us~aapl.oq~\\u82f9\\u679c~pg~GP^hk~00700~\\u817e\\u8baf\\u63a7\\u80a1~txkg~GP^jj~000001~xx~x~JJ"'
    const r = q.parseSearchResponse(text)
    assert.deepStrictEqual(r.map(x => [x.code, x.name]), [
      ['sh600519', '贵州茅台'],
      ['usAAPL', '苹果'],
      ['hk00700', '腾讯控股']
    ])
    assert.deepStrictEqual(q.parseSearchResponse('v_hint="N"'), [])
  },

  'formatMarketCap 单位换算'() {
    assert.strictEqual(q.formatMarketCap(21362.1, 'CNY'), '2.14万亿元')
    assert.strictEqual(q.formatMarketCap(3456.789, 'HKD'), '3,456.79亿港元')
    assert.strictEqual(q.formatMarketCap(0.5, 'USD'), '5,000万美元')
    assert.strictEqual(q.formatMarketCap(null, 'USD'), '--')
  },

  'formatChange 涨跌符号与颜色'() {
    assert.deepStrictEqual(q.formatChange(10.5, 0.62), { text: '+10.50 (+0.62%)', trend: 'up' })
    assert.deepStrictEqual(q.formatChange(-1.9, -0.82), { text: '-1.90 (-0.82%)', trend: 'down' })
    assert.deepStrictEqual(q.formatChange(0, 0), { text: '0.00 (0.00%)', trend: 'flat' })
  },

  'parseKline 取收盘价'() {
    const json = { data: { sh600519: { qfqday: [['2026-10-12', '1', '2', '3', '0.5', '100'], ['2026-10-13', '2', '2.5', '3', '1', '100']] } } }
    assert.deepStrictEqual(q.parseKline(json, 'sh600519'), [
      { date: '2026-10-12', close: 2 },
      { date: '2026-10-13', close: 2.5 }
    ])
    assert.deepStrictEqual(q.parseKline({}, 'sh600519'), [])
  }
}

let failed = 0
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn()
    console.log('✓', name)
  } catch (e) {
    failed++
    console.log('✗', name, '\n ', e.message)
  }
}
process.exit(failed ? 1 : 0)
