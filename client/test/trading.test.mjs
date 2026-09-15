import { test } from 'node:test'
import assert from 'node:assert/strict'
import { quantityValue, tradingBlock, orderError, displayAccount, newOrderId } from '../src/trading/model.js'
import { getTrading, sendOrder } from '../src/trading/api.js'

const order = { orderId: 'f782d648-98fb-4da0-86ba-e2e575ee7d56', companyId: 'A', type: 'BUY', quantity: 2 }
const account = { cash: 80000, holdings: [{ companyId: 'A', name: 'A', quantity: 2, marketValue: 20000 }] }
const company = { companyId: 'A', currentPrice: 10000 }

test('quantity rejects fractions, signs, exponent notation and out-of-range input', () => {
  for (const value of ['', '0', '-1', '1.5', '1e3', ' 1', '1000001', '9007199254740993']) assert.equal(quantityValue(value), null)
  assert.equal(quantityValue('1'), 1)
  assert.equal(quantityValue('1000000'), 1000000)
})
test('trading is blocked before start, after close, on pause and when stale', () => {
  const game = { status: 'RUNNING', phase: 'TRADING', tradingEnabled: true }
  assert.equal(tradingBlock(game, false), '')
  for (const status of ['WAITING', 'PAUSED', 'FINISHED']) assert.ok(tradingBlock({ ...game, status }, false))
  assert.ok(tradingBlock({ ...game, phase: 'RESULT', tradingEnabled: false }, false))
  assert.ok(tradingBlock(game, true))
})
test('order estimates reject overspending and overselling, allow exact balances', () => {
  assert.equal(orderError({ company, quantity: 8, type: 'BUY', account }), '')
  assert.ok(orderError({ company, quantity: 9, type: 'BUY', account }))
  assert.equal(orderError({ company, quantity: 2, type: 'SELL', account }), '')
  assert.ok(orderError({ company, quantity: 3, type: 'SELL', account }))
  assert.deepEqual(displayAccount(account), { cash: 80000, stockValue: 20000, totalAssets: 100000 })
})
test('market/portfolio consume the actual Backend response shape', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.credentials, 'include')
    return Response.json(url.endsWith('/market') ? { companies: [{ ...company, name: 'A' }] } : { account })
  })
  assert.equal((await getTrading()).companies[0].companyId, 'A')
})
test('retry transmits exactly the original order ID and accepts duplicate success', async (t) => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/trading/orders')
    requests.push(JSON.parse(options.body))
    return Response.json({ duplicate: requests.length > 1, transaction: { ...order, price: 10000, totalPrice: 20000 }, account })
  })
  await sendOrder(order)
  assert.equal((await sendOrder(order)).duplicate, true)
  assert.deepEqual(requests, [order, order])
})
test('lost/invalid/server-error responses remain unresolved, authoritative rejection does not', async (t) => {
  const mock = t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline') })
  await assert.rejects(sendOrder(order), (e) => e.uncertain === true)
  mock.mock.mockImplementation(async () => Response.json({ error: 'SERVICE_UNAVAILABLE' }, { status: 503 }))
  await assert.rejects(sendOrder(order), (e) => e.uncertain === true)
  mock.mock.mockImplementation(async () => Response.json({ error: 'TRADING_CLOSED' }, { status: 409 }))
  await assert.rejects(sendOrder(order), (e) => e.uncertain === false && e.message === 'TRADING_CLOSED')
  mock.mock.mockImplementation(async () => Response.json({ transaction: { ...order, orderId: 'different' }, account }))
  await assert.rejects(sendOrder(order), (e) => e.uncertain === true)
})

test('LAN HTTP UUID fallback preserves UUID v4 version and variant', () => {
  const uuid = newOrderId({ getRandomValues: (bytes) => bytes.fill(255) })
  assert.match(uuid, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  assert.throws(() => newOrderId({}))
})
