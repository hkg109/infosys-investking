import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { verifyAdmin, adminAuthError } from '../src/admin/api.js'
async function component(path) {
  const dir = await mkdtemp(join(process.cwd(), '.qa-test-'))
  try {
    const outfile = join(dir, 'component.mjs')
    await build({ entryPoints: [path], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
    return (await import(pathToFileURL(outfile).href)).default
  } finally { await rm(dir, { recursive: true, force: true }) }
}
const Gate = await component('src/admin/AdminGate.jsx')
const Connection = await component('src/components/GameConnection.jsx')
const Trading = await component('src/components/TradingPanel.jsx')
test('admin dashboard children remain unmounted until password is verified', () => {
  let mounted = false
  const html = renderToStaticMarkup(createElement(MemoryRouter, {}, createElement(Gate, { children: () => { mounted = true; return 'private dashboard' } })))
  assert.equal(mounted, false)
  assert.match(html, /관리자 로그인/)
  assert.match(html, /type="password"/)
  assert.doesNotMatch(html, /private dashboard/)
})
test('admin verification only accepts explicit success and never includes password in URL/body', async () => {
  const original = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/admin/auth/verify')
      assert.equal(options.method, 'POST')
      assert.equal(options.headers.Authorization, 'Bearer test-only-secret')
      assert.equal(options.body, undefined)
      assert.equal(options.cache, 'no-store')
      return { ok: true, json: async () => ({ authenticated: true }) }
    }
    await verifyAdmin('test-only-secret')
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ authenticated: false }) })
    await assert.rejects(verifyAdmin('test-only-secret'), /INVALID_RESPONSE/)
    globalThis.fetch = async () => ({ ok: false, json: async () => ({ error: 'ADMIN_AUTH_REQUIRED' }) })
    await assert.rejects(verifyAdmin('test-only-secret'), /ADMIN_AUTH_REQUIRED/)
    assert.match(adminAuthError(new Error('ADMIN_AUTH_UNAVAILABLE')), /설정되지/)
    assert.match(adminAuthError(new Error('ADMIN_AUTH_REQUIRED')), /올바르지/)
  } finally { globalThis.fetch = original }
})
test('healthy connection is compact; disconnected and failed states retain retry', () => {
  const html = props => renderToStaticMarkup(createElement(Connection, props))
  assert.doesNotMatch(html({ connected: true }), /<button/)
  assert.match(html({ connected: false }), /연결 업데이트/)
  assert.match(html({ connected: true, error: '조회 실패' }), /조회 실패/)
  assert.match(html({ loading: true }), /불러오고/)
})
test('unresolved and pending orders disable the custom order surface', () => {
  for (const extra of [{ pending: true }, { unresolved: { orderId: 'test', companyId: 'A', quantity: 2, type: 'BUY' } }]) {
    const html = renderToStaticMarkup(createElement(Trading, { game: { status: 'RUNNING', tradingOpen: true }, trading: { ready: true, companies: [], account: { cash: 10, holdings: [] }, ...extra } }))
    assert.match(html, /<button class="primary-button" type="button" disabled="">매수·매도 주문 열기<\/button>/)
    assert.doesNotMatch(html, /입력 초기화/)
  }
})
