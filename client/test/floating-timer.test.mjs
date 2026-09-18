import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { clampTimerRect, defaultTimerRect, loadTimerRect, saveTimerRect, TIMER_STORAGE_KEY } from '../src/game/floatingTimer.js'

const viewport = { width: 400, height: 300 }

test('floating timer always stays inside the visible viewport', () => {
  assert.deepEqual(clampTimerRect({ x: -20, y: -10, width: 300, height: 160 }, viewport), { x: 12, y: 12, width: 300, height: 160 })
  assert.deepEqual(clampTimerRect({ x: 9999, y: 9999, width: 300, height: 160 }, viewport), { x: 88, y: 128, width: 300, height: 160 })
  const small = defaultTimerRect({ width: 200, height: 130 })
  assert.deepEqual(small, { x: 12, y: 12, width: 176, height: 106 })
})

test('floating timer enforces size limits and safely restores browser storage', () => {
  const values = new Map()
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }
  const tiny = clampTimerRect({ x: 30, y: 30, width: 10, height: 10 }, viewport)
  assert.equal(tiny.width, 260)
  assert.equal(tiny.height, 142)
  assert.equal(saveTimerRect(storage, tiny), true)
  assert.deepEqual(loadTimerRect(storage, viewport), tiny)
  values.set(TIMER_STORAGE_KEY, '{broken')
  assert.deepEqual(loadTimerRect(storage, viewport), defaultTimerRect(viewport))
  assert.equal(saveTimerRect({ setItem() { throw new Error('blocked') } }, tiny), false)
})

test('floating timer renders server-derived month, time, state, and controls', async () => {
  const dir = await mkdtemp(join(process.cwd(), '.timer-test-'))
  try {
    const outfile = join(dir, 'component.mjs')
    await build({ entryPoints: ['src/components/FloatingGameTimer.jsx'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
    const Timer = (await import(pathToFileURL(outfile).href)).default
    const html = renderToStaticMarkup(createElement(Timer, { game: { status: 'RUNNING', currentRound: 4, remainingSeconds: 125, tradingEnabled: true } }))
    assert.match(html, /4월/)
    assert.match(html, /02:05/)
    assert.match(html, /진행 중/)
    assert.match(html, /거래 가능/)
    assert.match(html, /위치 초기화/)
    assert.match(html, /크기 조절 손잡이/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
