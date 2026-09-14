import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPin, verifyPin } from '../src/pin.js'

test('PIN hashes have independent salts and preserve leading zeros', async () => {
  const first = await hashPin('0012')
  const second = await hashPin('0012')
  assert.notEqual(first, second)
  assert.equal(await verifyPin('0012', first), true)
  assert.equal(await verifyPin('0013', first), false)
  assert.equal(await verifyPin('12', first), false)
  assert.equal(await verifyPin('0012', 'broken'), false)
})
