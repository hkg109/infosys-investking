import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { companyInput, validateCompanies, companyRequest } from '../src/companies/api.js'
const dir = await mkdtemp(join(process.cwd(), '.companies-test-'))
let CompanyList, canManageCompanies
try {
  await build({ entryPoints: ['src/companies/CompanyManager.jsx'], outfile: join(dir, 'view.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
  ;({ CompanyList, canManageCompanies } = await import(pathToFileURL(join(dir, 'view.mjs')).href))
} finally { await rm(dir, { recursive: true, force: true }) }
const form = { companyId: ' test-1 ', name: ' 회사 ', description: '', initialPrice: '10000', isActive: true }
const company = { ...companyInput(form), currentPrice: 10000, references: { transactions: 2, holdings: 1, eventEffects: 3 } }
test('company input normalizes codes and omits immutable code on update', () => {
  assert.equal(companyInput(form).companyId, 'TEST-1')
  assert.equal(companyInput(form).name, '회사')
  assert.equal('companyId' in companyInput(form, true), false)
  assert.equal(companyInput({ ...form, name: '😀'.repeat(60) }).name.length, 120)
  for (const change of [{ companyId: '_A' }, { companyId: '가' }, { name: '😀'.repeat(61) }, { name: 'a\u200bb' }, { description: 'a\nb' }, { description: 'a'.repeat(2001) }, ...['0', '-1', '1.5', '1e3', '9007199254740992', ''].map(initialPrice => ({ initialPrice }))]) assert.throws(() => companyInput({ ...form, ...change }))
})
test('company response rejects duplicates and malformed reference counts', () => {
  assert.deepEqual(validateCompanies({ companies: [company] }), [company])
  for (const companies of [[company, company], [{ ...company, references: { ...company.references, holdings: -1 } }], [{ ...company, currentPrice: null }]]) assert.throws(() => validateCompanies({ companies }))
})
test('company changes require waiting state and a fresh confirmed list', () => {
  const ready = { status: 'WAITING', fresh: true }
  assert.equal(canManageCompanies(ready), true)
  for (const change of [{ status: 'RUNNING' }, { status: 'PAUSED' }, { status: 'FINISHED' }, { stale: true }, { busy: true }, { fresh: false }, { uncertain: true }]) assert.equal(canManageCompanies({ ...ready, ...change }), false)
})
test('inactive companies and preserved references remain visible with escaped text', () => {
  const html = renderToStaticMarkup(createElement(CompanyList, { companies: [{ ...company, name: '<script>회사</script>', isActive: false }], canEdit: false }))
  assert.match(html, /비활성/); assert.match(html, /거래 2건/); assert.match(html, /보유 1건/); assert.match(html, /사건 효과 3건/); assert.match(html, /과거 기록은 보존/)
  assert.match(html, /disabled=""/); assert.doesNotMatch(html, /<script>/); assert.doesNotMatch(html, /비활성화<\/button>/)
})
test('company writes use authenticated JSON and never retry uncertain outcomes', async () => {
  const previous = globalThis.fetch
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, '/api/companies/admin/TEST-1'); assert.equal(options.headers.Authorization, 'Bearer local-test'); assert.equal(options.method, 'PUT')
      assert.deepEqual(JSON.parse(options.body), companyInput(form, true))
      return { ok: true, status: 200, json: async () => ({ company }) }
    }
    assert.deepEqual(await companyRequest('/TEST-1', { password: 'local-test', method: 'PUT', body: companyInput(form, true) }), company)
    let calls = 0
    globalThis.fetch = async () => { calls++; throw new TypeError('network lost') }
    await assert.rejects(companyRequest('', { method: 'POST' }), error => error.uncertain === true)
    assert.equal(calls, 1)
    globalThis.fetch = async () => ({ ok: false, status: 409, json: async () => ({ error: 'COMPANY_ID_TAKEN' }) })
    await assert.rejects(companyRequest('', { method: 'POST' }), error => !error.uncertain && error.message === 'COMPANY_ID_TAKEN')
    globalThis.fetch = async () => ({ ok: true, status: 204 })
    assert.equal(await companyRequest('/TEST-1', { method: 'DELETE' }), null)
    globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ company }) })
    await assert.rejects(companyRequest('/TEST-1', { method: 'DELETE' }), error => error.uncertain && error.message === 'INVALID_RESPONSE')
  } finally { globalThis.fetch = previous }
})
