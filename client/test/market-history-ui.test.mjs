import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getPriceHistory, getTradeHistory, validatePriceHistory, validateTradeHistory } from '../src/trading/historyApi.js'
import { chartGeometry, priceSeries, signedMoney } from '../src/trading/marketHistoryModel.js'

const trade = {
  transactionId: 'transaction-1', orderId: 'order-1', round: 2, companyId: 'A', companyName: 'A 엔터',
  type: 'SELL', quantity: 3, price: 12000, totalPrice: 36000, realizedProfit: 6000,
  createdAt: '2026-09-18T07:00:00.000Z',
}
const tradePayload = {
  round: 2, trades: [trade],
  summary: { tradeCount: 1, buyQuantity: 0, sellQuantity: 3, buyAmount: 0, sellAmount: 36000, netCashFlow: 36000, realizedProfit: 6000 },
}
const pricePayload = {
  company: { companyId: 'A', name: 'A 엔터', description: '엔터테인먼트 기업', active: true },
  history: [{
    round: 2, openingPrice: 10000, closingPrice: 12000, changeRate: 20,
    snapshots: [
      { snapshotType: 'OPEN', price: 10000, changeRate: 0, recordedAt: '2026-09-18T07:00:00.000Z' },
      { snapshotType: 'INTRADAY_EVENT', price: 12000, changeRate: 20, recordedAt: '2026-09-18T07:05:00.000Z', event: { gameEventId: 'game-event-1', eventId: 'event-1', title: '장중 속보', result: '상승' } },
      { snapshotType: 'CLOSE', price: 12000, changeRate: 20, recordedAt: '2026-09-18T07:10:00.000Z' },
    ],
  }],
}

test('market history validation accepts the documented backend contracts', () => {
  assert.equal(validateTradeHistory(tradePayload).summary.realizedProfit, 6000)
  assert.equal(validatePriceHistory(pricePayload).history[0].snapshots[1].event.title, '장중 속보')
  assert.equal(signedMoney(6000), '+6,000원')
  assert.equal(signedMoney(-2000), '-2,000원')
  assert.equal(signedMoney(0), '0원')
})

test('trade history rejects inconsistent counts, duplicate IDs, and leaked buy profit', () => {
  assert.throws(() => validateTradeHistory({ ...tradePayload, summary: { ...tradePayload.summary, tradeCount: 2 } }))
  assert.throws(() => validateTradeHistory({ ...tradePayload, trades: [trade, trade] }))
  assert.throws(() => validateTradeHistory({ ...tradePayload, trades: [{ ...trade, type: 'BUY', realizedProfit: 0 }] }))
  assert.throws(() => validateTradeHistory({ ...tradePayload, trades: [{ ...trade, createdAt: 'invalid' }] }))
})

test('price history rejects duplicate rounds, invalid prices, dates, and event metadata', () => {
  assert.throws(() => validatePriceHistory({ ...pricePayload, history: [...pricePayload.history, pricePayload.history[0]] }))
  const period = pricePayload.history[0]
  assert.throws(() => validatePriceHistory({ ...pricePayload, history: [{ ...period, openingPrice: 0 }] }))
  assert.throws(() => validatePriceHistory({ ...pricePayload, history: [{ ...period, snapshots: [{ ...period.snapshots[0], recordedAt: 'invalid' }] }] }))
  assert.throws(() => validatePriceHistory({ ...pricePayload, history: [{ ...period, snapshots: [{ ...period.snapshots[1], event: { title: '누락' } }] }] }))
})

test('history requests use the session cookie, safe encoded paths, and no cache', async (t) => {
  const calls = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options })
    return Response.json(url.includes('/companies/') ? pricePayload : tradePayload)
  })
  assert.equal((await getTradeHistory(2)).round, 2)
  assert.equal((await getPriceHistory('A/B')).company.companyId, 'A')
  assert.equal(calls[0].url, '/api/trading/history?round=2')
  assert.equal(calls[1].url, '/api/trading/companies/A%2FB/history')
  for (const call of calls) {
    assert.equal(call.options.credentials, 'include')
    assert.equal(call.options.cache, 'no-store')
  }
})

test('chart series filters by month and keeps equal prices centered', () => {
  const series = priceSeries(pricePayload.history, 2)
  assert.equal(series.length, 3)
  assert.equal(series[1].label, '2월 장중 사건')
  assert.deepEqual(priceSeries(pricePayload.history, 1), [])
  const equal = chartGeometry([{ key: 'a', price: 10000 }, { key: 'b', price: 10000 }])
  assert.equal(equal.points[0].y, 112)
  assert.equal(equal.points[1].y, 112)
  assert.match(equal.polyline, /54,112/)
})

test('price chart exposes event and price details without relying on color', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.market-history-ui-test-'))
  try {
    const outfile = join(dir, 'price-chart.mjs')
    await build({ entryPoints: ['src/trading/PriceHistoryPanel.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
    const { PriceChart } = await import(pathToFileURL(outfile).href)
    const html = renderToStaticMarkup(createElement(PriceChart, { series: priceSeries(pricePayload.history), companyName: 'A 엔터' }))
    assert.match(html, /월별 주가 변동 차트/)
    assert.match(html, /장중 속보/)
    assert.match(html, /12,000원/)
    assert.match(html, /\+20%/)
    assert.match(html, /timeline-dot--intraday_event/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
