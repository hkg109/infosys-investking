import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { appendMarketNotice, marketNotice } from '../src/game/marketNotice.js'

const dir = await mkdtemp(join(process.cwd(), '.market-context-test-'))
let CompanyInfoPopover, MarketEventNotifications, popoverPosition
try {
  await Promise.all([
    build({ entryPoints: ['src/components/CompanyInfoPopover.jsx'], outfile: join(dir, 'company.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' }),
    build({ entryPoints: ['src/components/MarketEventNotifications.jsx'], outfile: join(dir, 'notices.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' }),
  ])
  ;({ default: CompanyInfoPopover, popoverPosition } = await import(pathToFileURL(join(dir, 'company.mjs')).href))
  ;({ default: MarketEventNotifications } = await import(pathToFileURL(join(dir, 'notices.mjs')).href))
} finally { await rm(dir, { recursive: true, force: true }) }

test('breaking notices accept only compact intraday identity and deduplicate IDs', () => {
  const payload = { gameEventId: 'game-event-1', title: ' 장중 속보 ', triggerPhase: 'INTRADAY', news: '알림에 표시하면 안 되는 본문', result: '비공개 결과' }
  assert.deepEqual(marketNotice(payload), { gameEventId: 'game-event-1', title: '장중 속보' })
  assert.equal(marketNotice({ ...payload, triggerPhase: 'CLOSE' }), null)
  assert.equal(marketNotice({ ...payload, title: '' }), null)
  const first = appendMarketNotice([], payload)
  assert.equal(appendMarketNotice(first, payload), first)
  const limited = ['2', '3', '4'].reduce((items, id) => appendMarketNotice(items, { ...payload, gameEventId: id, title: `속보 ${id}` }, 3), first)
  assert.deepEqual(limited.map(item => item.gameEventId), ['2', '3', '4'])
})

test('notification visually exposes only its title and has open and dismiss controls', () => {
  const html = renderToStaticMarkup(createElement(MarketEventNotifications, {
    notices: [{ gameEventId: 'event-1', title: '결제망 긴급 장애', news: '숨겨야 하는 본문', result: '숨겨야 하는 결과' }],
  }))
  assert.match(html, /결제망 긴급 장애/)
  assert.match(html, /장중 사건 기사 열기/)
  assert.match(html, /알림 닫기/)
  assert.doesNotMatch(html, /숨겨야 하는 본문|숨겨야 하는 결과/)
})

test('company description uses a custom dialog with a close button and market details', () => {
  const company = { id: 'A', name: '한양양조', description: '과일 막걸리를 생산하는 주류 회사입니다.', currentPrice: 11800, changeRate: 13 }
  const html = renderToStaticMarkup(createElement(CompanyInfoPopover, { company, open: true, selected: false }))
  assert.match(html, /role="dialog"/)
  assert.match(html, /과일 막걸리를 생산하는 주류 회사입니다/)
  assert.match(html, /기업 설명 닫기/)
  assert.match(html, /11,800원/)
  assert.match(html, /\+13%/)
  assert.match(html, /주문 화면으로 이동/)
})

test('company card placement remains inside desktop and compact viewports', () => {
  const card = { width: 320, height: 220 }
  assert.deepEqual(popoverPosition({ left: 100, right: 220, top: 80, bottom: 120 }, card, 1200, 800), { left: 230, top: 80, width: 320 })
  const edge = popoverPosition({ left: 900, right: 1010, top: 700, bottom: 744 }, card, 1024, 768)
  assert.ok(edge.left >= 12 && edge.left + edge.width <= 1012 && edge.top >= 12 && edge.top + card.height <= 756)
  const mobile = popoverPosition({ left: 20, right: 160, top: 500, bottom: 544 }, card, 360, 640, true)
  assert.ok(mobile.left >= 12 && mobile.left + mobile.width <= 348 && mobile.top >= 12)
})

test('shared footer uses the event organizer copy', async () => {
  const source = await readFile(new URL('../src/layouts/PageLayout.jsx', import.meta.url), 'utf8')
  assert.match(source, /한양대학교 정보시스템학과 16대 학생회 휘연 주최/)
  assert.doesNotMatch(source, /실시간 모의투자 게임 · 실제 화폐를 사용하지 않습니다/)
})
