import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { validateParticipants, getParticipants } from '../src/admin/participants.js'
import { allowedControl } from '../src/game/model.js'
const dir = await mkdtemp(join(process.cwd(), '.participants-test-'))
let ParticipantTable, ResetPanel, canConfirmReset
try {
  for (const name of ['ParticipantPanel', 'ResetPanel']) await build({ entryPoints: [`src/admin/${name}.jsx`], outfile: join(dir, `${name}.mjs`), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
  ;({ ParticipantTable } = await import(join(dir, 'ParticipantPanel.mjs')))
  ;({ default: ResetPanel, canConfirmReset } = await import(join(dir, 'ResetPanel.mjs')))
} finally { await rm(dir, { recursive: true, force: true }) }
const person = { userId: 'u1', nickname: '<script>이름</script>', online: true, cash: 0, stockValue: 200, totalAssets: 200, holdings: [{ companyId: 'A', name: 'A 기업', quantity: 2, currentPrice: 100, marketValue: 200 }] }
test('participant validation rejects malformed totals, duplicate IDs and inconsistent presence counts', () => {
  assert.equal(validateParticipants({ participants: [person], onlineParticipants: 1 }).participants.length, 1)
  for (const data of [{ participants: [person], onlineParticipants: 0 }, { participants: [person, person], onlineParticipants: 2 }, { participants: [{ ...person, cash: null }], onlineParticipants: 1 }, { participants: [{ ...person, holdings: null }], onlineParticipants: 1 }]) assert.throws(() => validateParticipants(data))
})
test('participant table shows real zero assets, holdings, safe nicknames and empty state', () => {
  const html = renderToStaticMarkup(createElement(ParticipantTable, { participants: [person] }))
  assert.match(html, /0원/); assert.match(html, /2주/); assert.match(html, /온라인/)
  assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>/)
  assert.match(renderToStaticMarkup(createElement(ParticipantTable, { participants: [] })), /등록된 참가자가 없습니다/)
})
test('reset requires finished status, fresh permission and both confirmation steps', () => {
  const valid = { status: 'FINISHED', canControl: true, pending: false, acknowledged: true, confirmation: '초기화' }
  assert.equal(canConfirmReset(valid), true)
  for (const change of [{ status: 'RUNNING' }, { status: 'WAITING' }, { status: 'PAUSED' }, { canControl: false }, { pending: true }, { acknowledged: false }, { confirmation: '' }, { confirmation: '초기화 ' }]) assert.equal(canConfirmReset({ ...valid, ...change }), false)
  assert.equal(allowedControl('reset', 'FINISHED'), true)
  assert.equal(allowedControl('reset', 'RUNNING'), false)
  const html = renderToStaticMarkup(createElement(ResetPanel, { game: { status: 'RUNNING' }, canControl: true }))
  assert.match(html, /되돌릴 수 없습니다/); assert.match(html, /disabled=""/)
})
test('participant request uses administrator authorization and does not leak it in URL', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => { assert.equal(url, '/api/admin/participants'); assert.equal(options.headers.Authorization, 'Bearer test-only'); assert.equal(options.cache, 'no-store'); return { ok: true, json: async () => ({ participants: [], onlineParticipants: 0 }) } }
    assert.deepEqual(await getParticipants('test-only'), { participants: [], onlineParticipants: 0 })
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'ADMIN_AUTH_REQUIRED' }) })
    await assert.rejects(getParticipants('test-only'), /ADMIN_AUTH_REQUIRED/)
  } finally { globalThis.fetch = previous }
})
