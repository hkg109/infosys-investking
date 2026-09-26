import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { clampNewsRect, defaultNewsRect, loadNewsRect, saveNewsRect, NEWS_STORAGE_KEY } from '../src/game/floatingNews.js'

const viewport = { width: 400, height: 300 }

test('floating news stays visible and restores a saved position', () => {
  assert.deepEqual(clampNewsRect({ x: -20, y: -10, width: 340, height: 280 }, viewport), { x: 12, y: 12, width: 340, height: 276 })
  const small = defaultNewsRect({ width: 200, height: 180 })
  assert.deepEqual(small, { x: 12, y: 12, width: 176, height: 156 })
  const values = new Map()
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  const rect = clampNewsRect({ x: 24, y: 12, width: 340, height: 276 }, viewport)
  assert.equal(saveNewsRect(storage, rect), true)
  assert.deepEqual(loadNewsRect(storage, viewport), rect)
  values.set(NEWS_STORAGE_KEY, '{broken')
  assert.deepEqual(loadNewsRect(storage, viewport), defaultNewsRect(viewport))
})

test('floating news feed renders controls, current month, and market articles', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.floating-news-test-'))
  try {
    const outfile = join(dir, 'component.mjs')
    await build({ entryPoints: ['src/components/FloatingNews.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
    const { FloatingNewsFeed } = await import(pathToFileURL(outfile).href)
    const event = { gameEventId: 'event-1', round: 4, title: '학과 행사 개최', news: '참가자가 몰렸습니다.', result: '', triggerPhase: 'INTRADAY', applied: false, changes: [] }
    const html = renderToStaticMarkup(createElement(FloatingNewsFeed, { game: { status: 'RUNNING', currentRound: 4 }, events: [event], error: '', loading: false, onRetry: () => {}, onOpenFull: () => {} }))
    assert.match(html, /4월 속보/)
    assert.match(html, /학과 행사 개최/)
    assert.match(html, /뉴스 탭 열기/)
    assert.match(html, /뉴스 업데이트/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
