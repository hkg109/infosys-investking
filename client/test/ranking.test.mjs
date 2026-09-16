import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { validateRanking, getRanking } from '../src/ranking/api.js'
const dir = await mkdtemp(join(process.cwd(), '.ranking-test-'))
let RankingResults
try {
  const outfile = join(dir, 'component.mjs')
  await build({ entryPoints: ['src/ranking/RankingPanel.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
  ;({ RankingResults } = await import(outfile))
} finally { await rm(dir, { recursive: true, force: true }) }
const people = ['가', '나', '다', '<script>라</script>'].map(nickname => ({ nickname, rank: 1, totalAssets: 1000000 }))
const ranking = { final: false, calculatedAt: '2026-09-16T00:00:00Z', totalParticipants: 4, top3: people, me: { ...people[0], cash: 900000, stockValue: 100000 } }
const data = { gameStatus: 'RUNNING', ranking }
const render = (value, finished = false) => renderToStaticMarkup(createElement(RankingResults, { data: value, finished }))
test('TOP3 keeps every tied participant and safely escapes nicknames', () => {
  const html = render(data)
  assert.equal((html.match(/class="ranking-place"/g) || []).length, 4)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>/)
  assert.match(html, /900,000원/)
})
test('final results distinguish confirmed, pending, empty, and missing personal rank', () => {
  assert.match(render(data, true), /확정 전 순위/)
  assert.match(render({ ...data, ranking: { ...ranking, final: true } }), /나의 최종 결과/)
  const empty = render({ ...data, ranking: { ...ranking, me: null, top3: [], totalParticipants: 0 } })
  assert.match(empty, /아직 순위에 등록된 참가자가 없습니다/)
  assert.match(empty, /포함되어 있지 않습니다/)
  assert.doesNotMatch(empty, /0위/)
  assert.match(render(null), /불러오고/)
})
test('invalid server data never becomes a fabricated ranking', () => {
  assert.equal(validateRanking(data), data)
  for (const patch of [{ final: 'true' }, { calculatedAt: 'invalid' }, { totalParticipants: -1 }, { top3: [{ ...people[0], rank: 0 }] }, { me: { ...ranking.me, cash: null } }]) assert.throws(() => validateRanking({ ...data, ranking: { ...ranking, ...patch } }))
})
test('ranking request uses cookie session, bypasses cache and reports expired session', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => { assert.equal(url, '/api/rankings'); assert.equal(options.credentials, 'include'); assert.equal(options.cache, 'no-store'); return { ok: true, json: async () => data } }
    assert.deepEqual(await getRanking(), data)
    globalThis.fetch = async () => ({ ok: false, status: 401 })
    await assert.rejects(getRanking(), /SESSION_REQUIRED/)
  } finally { globalThis.fetch = original }
})
