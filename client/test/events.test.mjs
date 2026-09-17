import assert from 'node:assert/strict'
import { test } from 'node:test'
import { eventInput } from '../src/events/api.js'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
const dir = await mkdtemp(join(process.cwd(), '.event-test-'))
let EventArticle, EventNews, currentEvents
try {
  const outfile = join(dir, 'component.mjs')
  await build({ entryPoints: ['src/events/EventNews.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
  const module = await import(pathToFileURL(outfile).href)
  EventArticle = module.EventArticle
  EventNews = module.default
  currentEvents = module.currentEvents
} finally { await rm(dir, { recursive: true, force: true }) }
const input = { title: ' 사건 ', news: '뉴스', result: '비공개 결과', effects: [{ companyId: 'A', changeRate: '-99' }] }
test('event form validates required text, duplicate companies, integer rates and limits', () => {
  assert.equal(eventInput(input).effects[0].changeRate, -99)
  assert.equal(eventInput(input).title, '사건')
  for (const changeRate of ['', '-100', '1001', '1.5', '1e2']) assert.throws(() => eventInput({ ...input, effects: [{ companyId: 'A', changeRate }] }))
  assert.throws(() => eventInput({ ...input, effects: [...input.effects, ...input.effects] }))
  assert.throws(() => eventInput({ ...input, news: ' ' }))
  assert.throws(() => eventInput({ ...input, title: 'a'.repeat(101) }))
})
test('unapplied event never renders result or rates even if accidentally present in payload', () => {
  const event = { ...input, round: 1, applied: false, changes: [{ companyId: 'A', name: 'A', previousPrice: 10000, newPrice: 12000, changeRate: 20 }] }
  const html = renderToStaticMarkup(createElement(EventArticle, { event }))
  assert.match(html, /뉴스/)
  assert.doesNotMatch(html, /비공개 결과|12,000원|20%/)
  const applied = renderToStaticMarkup(createElement(EventArticle, { event: { ...event, title: '<script>attack</script>', applied: true } }))
  assert.match(applied, /비공개 결과/)
  assert.match(applied, /12,000원/)
  assert.match(applied, /&lt;script&gt;/)
  assert.doesNotMatch(applied, /<script>/)
})

test('news initial loading render tolerates absent game and response', () => {
  assert.match(renderToStaticMarkup(createElement(EventNews, {})), /이번 달 뉴스를 확인/)
})

test('current news includes every event in the current month and never leaks the previous month', () => {
  const events = [{ eventId: 'one', round: 1 }, { eventId: 'two', round: 1 }, { eventId: 'three', round: 2 }]
  assert.deepEqual(currentEvents({ events, event: events[0] }, 1), events.slice(0, 2))
  assert.deepEqual(currentEvents({ events: [], event: events[0] }, 1), [])
  assert.deepEqual(currentEvents({ event: events[0] }, 2), [])
  const html = renderToStaticMarkup(createElement(EventArticle, { event: { ...input, round: 1, triggerPhase: 'INTRADAY', applied: false } }))
  assert.match(html, /장중 사건/)
  assert.doesNotMatch(html, /거래가 마감|비공개 결과/)
})
