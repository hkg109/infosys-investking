import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { marketNoticeStatus, mergeMarketNotice } from '../src/game/marketNotice.js'

const dir = await mkdtemp(join(process.cwd(), '.stage30-test-'))
let PurchaseDialog, EventNews, WaitingGameNotice, GameConnection, UserDashboard, MarketEventNotifications
try {
  const entries = {
    intelligence: 'src/intelligence/IntelligencePanel.jsx',
    news: 'src/events/EventNews.jsx',
    waiting: 'src/components/WaitingGameNotice.jsx',
    connection: 'src/components/GameConnection.jsx',
    dashboard: 'src/components/UserDashboard.jsx',
    notifications: 'src/components/MarketEventNotifications.jsx',
  }
  await Promise.all(Object.entries(entries).map(([name, entry]) => build({ entryPoints: [entry], outfile: join(dir, `${name}.mjs`), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })))
  ;({ PurchaseDialog } = await import(pathToFileURL(join(dir, 'intelligence.mjs')).href))
  ;({ default: EventNews } = await import(pathToFileURL(join(dir, 'news.mjs')).href))
  ;({ default: WaitingGameNotice } = await import(pathToFileURL(join(dir, 'waiting.mjs')).href))
  ;({ default: GameConnection } = await import(pathToFileURL(join(dir, 'connection.mjs')).href))
  ;({ default: UserDashboard } = await import(pathToFileURL(join(dir, 'dashboard.mjs')).href))
  ;({ default: MarketEventNotifications } = await import(pathToFileURL(join(dir, 'notifications.mjs')).href))
} finally { await rm(dir, { recursive: true, force: true }) }

const item = { clueId: 'clue-1', title: '축제 소비 정보', summary: '요약', price: 100000, availableRound: 1, canPurchase: true }
const data = { cash: 350000, purchaseOpen: true, currentRound: 1, items: [item], purchases: [] }

test('purchase confirmation is one custom modal with cash preview and only cancel/purchase actions', () => {
  const store = { data, busy: false, purchaseError: '', options: { stale: false, busy: false } }
  const html = renderToStaticMarkup(createElement(PurchaseDialog, { review: item, item, store, onCancel() {}, onConfirm() {} }))
  assert.match(html, /role="dialog"/)
  assert.match(html, /backdrop/)
  assert.match(html, /350,000원/)
  assert.match(html, /250,000원/)
  assert.match(html, /data-autofocus="true"/)
  assert.doesNotMatch(html, /정보 구매 닫기/)
  assert.equal((html.match(/<button/g) || []).length, 2)
  const busy = renderToStaticMarkup(createElement(PurchaseDialog, { review: item, item, store: { ...store, busy: true, purchaseError: '연결 실패' }, onCancel() {}, onConfirm() {} }))
  assert.match(busy, /연결 실패/)
  assert.equal((busy.match(/disabled=""/g) || []).length, 2)
})

test('intraday alert countdown covers 30, 45 and 65 second schedules and every lifecycle state', () => {
  const now = Date.parse('2026-09-27T00:00:00.000Z')
  for (const seconds of [30, 45, 65]) {
    const notice = { state: 'WARNING', scheduledAt: new Date(now + seconds * 1000).toISOString() }
    assert.equal(marketNoticeStatus(notice, now), `속보 예정 · ${seconds < 60 ? '00' : '01'}:${String(seconds % 60).padStart(2, '0')} 후 발생`)
  }
  assert.equal(marketNoticeStatus({ state: 'HALTED' }, now), '사건 처리 중 · 거래 일시정지')
  assert.equal(marketNoticeStatus({ state: 'HALTED', haltEndsAt: now + 3000 }, now), '사건 처리 중 · 거래 일시정지 · 00:03 후 재개')
  assert.equal(marketNoticeStatus({ state: 'APPLYING' }, now), '속보 발생 · 주가 반영 중')
  assert.equal(marketNoticeStatus({ state: 'CLOSED' }, now), '마감됨 · 거래가 재개되었습니다')
})

test('socket lifecycle updates one compact alert without storing private article fields', () => {
  const payload = { gameEventId: 'event-1', title: '[속보] 결제망 점검', triggerPhase: 'INTRADAY', scheduledAt: '2026-09-27T00:00:30.000Z', news: '비공개 기사', result: '비공개 결과', changes: [{ changeRate: 30 }] }
  let notices = mergeMarketNotice([], payload, 'WARNING', 1)
  notices = mergeMarketNotice(notices, payload, 'WARNING', 2)
  notices = mergeMarketNotice(notices, { gameEventId: 'event-1', title: payload.title }, 'HALTED', 3)
  notices = mergeMarketNotice(notices, { gameEventId: 'event-1', title: payload.title, serverTime: '2026-09-27T00:00:34.000Z' }, 'CLOSED', 4)
  assert.equal(notices.length, 1)
  assert.equal(notices[0].state, 'CLOSED')
  assert.equal(notices[0].news, undefined)
  assert.equal(notices[0].result, undefined)
  assert.equal(notices[0].changes, undefined)
  const html = renderToStaticMarkup(createElement(MarketEventNotifications, { notices }))
  assert.match(html, /마감됨/)
  assert.doesNotMatch(html, /비공개 기사|비공개 결과|30%/)
})

test('news page opens the shared floating window and waiting status is a detached notification', () => {
  const feed = { events: [], error: '', loading: false, refresh() {} }
  const news = renderToStaticMarkup(createElement(EventNews, { game: { status: 'RUNNING', currentRound: 1 }, feed, onOpenFloating() {} }))
  assert.match(news, /뉴스 창으로 보기/)
  const waiting = renderToStaticMarkup(createElement(WaitingGameNotice, { waiting: true }))
  assert.match(waiting, /waiting-game-notice/)
  assert.match(waiting, /게임 시작을 기다리고 있습니다/)
  const dashboard = renderToStaticMarkup(createElement(UserDashboard, { game: { status: 'WAITING' }, snapshot: {} }))
  assert.doesNotMatch(dashboard, /게임 시작을 기다리고 있습니다/)
})

test('connection state is compact header chrome and retains recovery action', () => {
  const healthy = renderToStaticMarkup(createElement(GameConnection, { connected: true, loading: false, error: '' }))
  assert.match(healthy, /header-connection--healthy/)
  assert.match(healthy, /실시간 연결됨/)
  assert.doesNotMatch(healthy, /연결 업데이트/)
  const failed = renderToStaticMarkup(createElement(GameConnection, { connected: false, loading: false, error: '연결 실패', refresh() {} }))
  assert.match(failed, /header-connection--attention/)
  assert.match(failed, /연결 업데이트/)
})
