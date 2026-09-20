import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { getBroadcast } from '../src/broadcast/api.js'
import { broadcastSeconds, nextSpotlight, retryDelay, sceneFor, validateBroadcast } from '../src/broadcast/model.js'

const now = '2026-09-20T07:00:00.000Z'
const snapshot = {
  version: 1, serverTime: now, pollAfterMs: 1000,
  game: { status: 'RUNNING', phase: 'TRADING', phaseBeforePause: null, currentRound: 2, totalRounds: 12, remainingSeconds: 60, phaseEndsAt: '2026-09-20T07:01:00.000Z', startedAt: now, finishedAt: null, tradingHalted: false, tradingEnabled: true },
  market: [{ companyId: 'A', name: 'A 기업', currentPrice: 11000, openingPrice: 10000, changeRate: 10 }],
  ranking: { final: false, calculatedAt: now, totalParticipants: 2, top3: [{ rank: 1, totalAssets: 1100000 }, { rank: 2, totalAssets: 900000 }], rankings: [{ rank: 1, totalAssets: 1100000 }, { rank: 2, totalAssets: 900000 }] },
  news: [], warnings: [], results: [],
}

test('broadcast validates public payload and rejects private ranking fields', () => {
  assert.equal(validateBroadcast(snapshot), snapshot)
  assert.throws(() => validateBroadcast({ ...snapshot, version: 2 }))
  assert.throws(() => validateBroadcast({ ...snapshot, ranking: { ...snapshot.ranking, top3: [{ rank: 1, totalAssets: 1100000, nickname: '비밀' }] } }))
  assert.throws(() => validateBroadcast({ ...snapshot, warnings: [{ gameEventId: 'w', scheduledAt: now, title: '미공개 제목' }] }))
  assert.throws(() => validateBroadcast({ ...snapshot, game: { ...snapshot.game, remainingSeconds: -1 } }))
})

test('scene precedence follows waiting, pause, result, finalization and final ranking', () => {
  assert.equal(sceneFor(null), 'loading')
  assert.equal(sceneFor(snapshot), 'market')
  assert.equal(sceneFor({ ...snapshot, game: { ...snapshot.game, status: 'WAITING' } }), 'waiting')
  assert.equal(sceneFor({ ...snapshot, game: { ...snapshot.game, status: 'PAUSED' } }, { kind: 'result' }), 'paused')
  assert.equal(sceneFor({ ...snapshot, game: { ...snapshot.game, phase: 'RESULT' } }), 'result')
  assert.equal(sceneFor({ ...snapshot, game: { ...snapshot.game, status: 'FINISHED' } }), 'finalizing')
  assert.equal(sceneFor({ ...snapshot, game: { ...snapshot.game, status: 'FINISHED' }, ranking: { ...snapshot.ranking, final: true } }), 'final')
})

test('initial fetch never replays old events; only newly arrived IDs trigger a spotlight', () => {
  const warning = { gameEventId: 'w1', scheduledAt: now }
  const result = { gameEventId: 'e1', title: '사건', result: '상승', triggerPhase: 'INTRADAY', appliedAt: now, changes: [] }
  assert.equal(nextSpotlight(null, { ...snapshot, warnings: [warning], results: [result] }), null)
  assert.deepEqual(nextSpotlight(snapshot, { ...snapshot, warnings: [warning] }, 100), { kind: 'warning', eventId: 'w1', until: 4600 })
  assert.deepEqual(nextSpotlight({ ...snapshot, warnings: [warning] }, { ...snapshot, results: [result] }, 100), { kind: 'result', eventId: 'e1', until: 6600 })
  assert.equal(nextSpotlight({ ...snapshot, results: [result] }, { ...snapshot, results: [result] }), null)
  assert.equal(nextSpotlight(snapshot, { ...snapshot, game: { ...snapshot.game, status: 'WAITING' }, results: [result] }), null)
})

test('server clock correction and retry delay are bounded', () => {
  const receivedAt = Date.parse(now) + 500
  assert.equal(broadcastSeconds({ ...snapshot, receivedAt }, receivedAt + 1600), 59)
  assert.equal(broadcastSeconds({ ...snapshot, game: { ...snapshot.game, status: 'PAUSED', remainingSeconds: 42 }, receivedAt }, receivedAt + 50000), 42)
  assert.deepEqual([1, 2, 3, 4].map(retryDelay), [2000, 4000, 8000, 8000])
})

test('public feed request sends no session credentials and skips cache', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/broadcast')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.credentials, 'omit')
    return Response.json(snapshot)
  })
  assert.equal((await getBroadcast()).game.currentRound, 2)
})

test('broadcast screen renders anonymous market, breaking result and shared third place', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.broadcast-test-'))
  try {
    const outfile = join(dir, 'screen.mjs')
    await build({ entryPoints: ['src/broadcast/BroadcastPage.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', loader: { '.css': 'empty' }, jsx: 'automatic' })
    const { BroadcastScreen } = await import(pathToFileURL(outfile).href)
    const html = renderToStaticMarkup(createElement(BroadcastScreen, { data: snapshot, remainingSeconds: 60 }))
    assert.match(html, /실시간 주가|실시간 TOP 3|A 기업|01:00/)
    assert.doesNotMatch(html, /닉네임|PIN|보유 현금/)
    const result = { gameEventId: 'e1', title: '속보', result: '주가 상승', triggerPhase: 'INTRADAY', appliedAt: now, changes: [{ companyId: 'A', previousPrice: 10000, newPrice: 11000, changeRate: 10 }] }
    const breaking = renderToStaticMarkup(createElement(BroadcastScreen, { data: { ...snapshot, results: [result] }, spotlight: { kind: 'result', eventId: 'e1' }, remainingSeconds: 50 }))
    assert.match(breaking, /속보|주가 상승|10,000원|11,000원|\+10%/)
    const final = renderToStaticMarkup(createElement(BroadcastScreen, { data: { ...snapshot, game: { ...snapshot.game, status: 'FINISHED' }, ranking: { final: true, calculatedAt: now, totalParticipants: 3, top3: [{ rank: 1, totalAssets: 100 }, { rank: 3, totalAssets: 90 }, { rank: 3, totalAssets: 90 }], rankings: [{ rank: 1, totalAssets: 100 }, { rank: 3, totalAssets: 90 }, { rank: 3, totalAssets: 90 }] } }, remainingSeconds: null }))
    assert.match(final, /최종 순위|3위.*3위/s)
  } finally { await rm(dir, { recursive: true, force: true }) }
})
