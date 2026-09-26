import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assetInput, adjustmentRequest } from '../src/admin/asset-adjustments.js'
const participant = { cash: 1000000, holdings: [{ companyId: 'A', quantity: 5 }] }
const form = { cash: '900000', companyId: 'A', quantity: '0', reason: ' 정정 ' }
test('asset edits validate absolute balances and capture concurrency baselines', () => {
  const body = assetInput(participant, form)
  assert.equal(body.reason, '정정'); assert.equal(body.cash, 900000); assert.equal(body.expectedCash, 1000000)
  assert.equal(body.quantity, 0); assert.equal(body.expectedQuantity, 5)
  assert.notEqual(body.requestId, assetInput(participant, form).requestId)
  for (const changes of [{ cash: '' }, { cash: '-1' }, { cash: '1e3' }, { cash: '0.5' }, { cash: '1000000000001' }, { quantity: '1000001' }, { reason: ' ' }, { cash: '1000000', quantity: '5' }]) assert.throws(() => assetInput(participant, { ...form, ...changes }))
})
test('lost or malformed responses stay uncertain and retries use exactly the supplied request', async () => {
  const original = globalThis.fetch
  const body = assetInput(participant, form)
  const result = { requestId: body.requestId, userId: 'user', companyId: 'A', reason: '정정', duplicate: true, before: { cash: 1000000, quantity: 5 }, after: { cash: 900000, quantity: 0 } }
  try {
    let calls = 0
    globalThis.fetch = async (_url, options) => { calls++; assert.deepEqual(JSON.parse(options.body), body); throw new TypeError('offline') }
    await assert.rejects(adjustmentRequest('user', 'pw', body), e => e.uncertain === true)
    assert.equal(calls, 1)
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ...result, requestId: 'wrong' }) })
    await assert.rejects(adjustmentRequest('user', 'pw', body), e => e.uncertain === true)
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'ASSET_CONFLICT', current: { cash: 800000, quantity: 3 } }) })
    await assert.rejects(adjustmentRequest('user', 'pw', body), e => !e.uncertain && e.message === 'ASSET_CONFLICT' && e.current.cash === 800000 && e.current.quantity === 3)
    globalThis.fetch = async () => ({ ok: true, json: async () => result })
    assert.equal((await adjustmentRequest('user', 'pw', body)).duplicate, true)
  } finally { globalThis.fetch = original }
})
