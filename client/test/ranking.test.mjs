import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { validateRanking, getRanking, rankingFailure } from '../src/ranking/api.js'
const dir = await mkdtemp(join(process.cwd(), '.ranking-test-'))
let RankingResults
try {
  const outfile = join(dir, 'component.mjs')
  await build({ entryPoints: ['src/ranking/RankingPanel.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
  ;({ RankingResults } = await import(pathToFileURL(outfile).href))
} finally { await rm(dir, { recursive: true, force: true }) }
const people = Array.from({ length: 4 }, (_, i) => ({ rank: 1, totalAssets: 1000000, isMe: i === 0 }))
const ranking = { final: false, calculatedAt: '2026-09-16T00:00:00Z', totalParticipants: 4, top3: people, rankings: people, me: { ...people[0], nickname: '<script>내 이름</script>', cash: 900000, stockValue: 100000 } }
const data = { gameStatus: 'RUNNING', ranking }
const finalPeople = people.map((person, index) => ({ ...person, nickname: ['<script>내 이름</script>', '밥', '찰리', '다나'][index] }))
const finalRanking = { ...ranking, final: true, top3: finalPeople, rankings: finalPeople }
const finalData = { gameStatus: 'FINISHED', ranking: finalRanking }
const render = (value, finished = false) => renderToStaticMarkup(createElement(RankingResults, { data: value, finished }))
test('anonymous TOP3 preserves ties, highlights only me, and never renders others identity', () => {
  const malicious = people.map(p => ({ ...p, nickname: '타인비밀닉네임', userId: 'secret-id', cash: 1234 }))
  const html = render({ ...data, ranking: { ...ranking, top3: malicious, rankings: malicious } })
  assert.equal((html.match(/class="ranking-place"/g) || []).length, 8)
  assert.equal((html.match(/class="ranking-self"/g) || []).length, 2)
  assert.doesNotMatch(html, /타인비밀닉네임|secret-id|1,234원|<script>/)
  assert.match(html, /&lt;script&gt;내 이름/)
  assert.match(html, /900,000원/)
})
test('own rank outside TOP3 is highlighted in the full list with competition ranking', () => {
  const all = [30,30,20,10].map((totalAssets,i) => ({totalAssets,rank:[1,1,3,4][i],isMe:i===3}))
  const result = validateRanking({ ...data, ranking: { ...ranking, rankings:all, top3:all.slice(0,3), me:{ ...ranking.me,rank:4,totalAssets:10,cash:10,stockValue:0 } } })
  const html=render(result)
  assert.equal((html.match(/class="ranking-self"/g)||[]).length,1)
  assert.match(html,/4위/)
})
test('final results distinguish confirmed, pending, empty, and missing personal rank', () => {
  assert.match(render(data, true), /확정 전 익명 순위/)
  const finalHtml = render(validateRanking(finalData))
  assert.match(finalHtml, /나의 최종 결과|게임 종료로 참가자 이름이 공개/)
  assert.match(finalHtml, /밥|찰리|다나/)
  assert.match(finalHtml, /&lt;script&gt;내 이름&lt;\/script&gt; \(나\)/)
  assert.doesNotMatch(finalHtml, /<script>/)
  const empty = render(validateRanking({ ...data, ranking: { ...ranking, me: null, rankings: [], top3: [], totalParticipants: 0 } }))
  assert.match(empty, /아직 순위에 등록된 참가자가 없습니다/)
  assert.match(empty, /포함되어 있지 않습니다/)
  assert.doesNotMatch(empty, /0위/)
  assert.match(render(null), /불러오고/)
})
test('response validation enforces anonymous live rankings and named final rankings', () => {
  assert.deepEqual(validateRanking(data), data)
  assert.deepEqual(validateRanking(finalData), finalData)
  assert.throws(() => validateRanking({ ...data, ranking:{ ...ranking, rankings:people.map(p=>({...p,nickname:'secret'})), top3:people.map(p=>({...p,nickname:'secret'})) } }))
  assert.throws(() => validateRanking({ ...finalData, ranking:{ ...finalRanking, rankings:people, top3:people } }))
  assert.throws(() => validateRanking({ ...finalData, gameStatus:'RUNNING' }))
  assert.throws(() => validateRanking({ ...finalData, ranking:{ ...finalRanking, rankings:finalPeople.map(p=>({...p,userId:'secret'})) } }))
  for (const patch of [{ final:'true' },{calculatedAt:'invalid'},{totalParticipants:3},{top3:people.slice(0,3)},{rankings:people.map(p=>({...p,isMe:true}))},{me:{...ranking.me,cash:null}},{me:null},{rankings:people.map(p=>({...p,rank:2}))}]) assert.throws(()=>validateRanking({...data,ranking:{...ranking,...patch}}))
})
test('session expiry clears personal results; transient errors only retain the same account', () => {
  const previous={userId:'one',data}
  assert.equal(rankingFailure(previous,'one',new Error('SESSION_REQUIRED')).data,null)
  assert.equal(rankingFailure(previous,'two',new Error('REQUEST_FAILED')).data,null)
  assert.equal(rankingFailure(previous,'one',new Error('REQUEST_FAILED')).data,data)
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
