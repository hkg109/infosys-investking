import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { allowedControl, formatTime, remainingSeconds, validateSnapshot } from '../src/game/model.js'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'

// Bundle JSX without a browser or a listening development server.
async function component(path) {
  const dir = await mkdtemp(join(process.cwd(), '.dashboard-test-'))
  try {
    const outfile = join(dir, 'component.mjs')
    await build({ entryPoints: [path], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
    return (await import(outfile)).default
  } finally { await rm(dir, { recursive: true, force: true }) }
}
const Admin = await component('src/components/AdminDashboard.jsx')
const User = await component('src/components/UserDashboard.jsx')

test('timer freezes on pause and never advances to another round on its own', () => {
  assert.equal(remainingSeconds({ status: 'RUNNING', remainingSeconds: 10 }, 12), 0)
  assert.equal(remainingSeconds({ status: 'PAUSED', remainingSeconds: 10 }, 12), 10)
  assert.equal(formatTime(remainingSeconds({ status: 'RUNNING', remainingSeconds: 600 }, 1.2)), '09:59')
  assert.equal(formatTime(null), '—')
})
test('only valid state transitions are offered, unknown states fail closed', () => {
  for (const [state, actions] of Object.entries({ WAITING: ['start'], RUNNING: ['pause', 'end'], PAUSED: ['resume', 'end'], FINISHED: [], UNKNOWN: [] })) {
    for (const action of ['start', 'pause', 'resume', 'end']) assert.equal(allowedControl(action, state), actions.includes(action))
  }
  assert.throws(() => validateSnapshot({ game: { status: 'toString' } }))
  assert.throws(() => validateSnapshot({}))
})
test('admin controls require fresh permission and are disabled during a request', () => {
  const props = { game: { status: 'RUNNING' }, onControl() {}, canControl: true }
  const render = (extra) => renderToStaticMarkup(createElement(Admin, { ...props, ...extra }))
  assert.equal((render({}).match(/disabled=""/g) || []).length, 2)
  assert.equal((render({ canControl: false }).match(/disabled=""/g) || []).length, 4)
  assert.equal((render({ pending: true }).match(/disabled=""/g) || []).length, 4)
})
test('missing account data is distinct from a real zero balance and empty holdings', () => {
  const missing = renderToStaticMarkup(createElement(User, {}))
  assert.match(missing, /보유 주식 정보를 기다리고/)
  assert.doesNotMatch(missing, /1,000,000원|1위/)
  const zero = renderToStaticMarkup(createElement(User, { snapshot: { account: { cash: 0 }, holdings: [], news: [], stocks: [] } }))
  assert.match(zero, /0원/)
  assert.match(zero, /아직 보유한 주식이 없습니다/)
})
test('server text is escaped and game end does not invent final rankings', () => {
  const html = renderToStaticMarkup(createElement(User, { game: { status: 'FINISHED' }, snapshot: { news: [{ id: 'n', title: '<script>alert(1)</script>', description: '뉴스' }] } }))
  assert.match(html, /게임이 종료되었습니다/)
  assert.match(html, /&lt;script&gt;/)
  assert.doesNotMatch(html, /<script>|1위/)
})
