import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(process.cwd(), '.stage31-test-'))
let assetEditBlock, estimatedTotalAssets, CompanyInfoPopover, popoverPosition
try {
  await Promise.all([
    build({ entryPoints: ['src/admin/AssetEditor.jsx'], outfile: join(dir, 'assets.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' }),
    build({ entryPoints: ['src/components/CompanyInfoPopover.jsx'], outfile: join(dir, 'company.mjs'), bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' }),
  ])
  ;({ assetEditBlock, estimatedTotalAssets } = await import(pathToFileURL(join(dir, 'assets.mjs')).href))
  ;({ default: CompanyInfoPopover, popoverPosition } = await import(pathToFileURL(join(dir, 'company.mjs')).href))
} finally { await rm(dir, { recursive: true, force: true }) }

test('asset editor explains state locks and estimates total assets from changed cash and holdings', () => {
  const baseline = { cash: 800000, stockValue: 200000, totalAssets: 1000000, holdings: [{ companyId: 'A', quantity: 10, currentPrice: 20000 }] }
  const preview = { cash: 700000, expectedCash: 800000, companyId: 'A', quantity: 12, expectedQuantity: 10 }
  assert.equal(estimatedTotalAssets(baseline, preview), 940000)
  assert.equal(assetEditBlock({ baseline, status: 'WAITING' }), '')
  assert.match(assetEditBlock({ baseline, status: 'RUNNING' }), /게임 진행 중/)
  assert.match(assetEditBlock({ baseline, status: 'PAUSED', stale: true }), /최신 상태/)
  assert.match(assetEditBlock({ baseline, status: 'PAUSED', pending: true }), /이전 수정 요청/)
})

test('company popover separates metadata and stays inside desktop and mobile viewports', () => {
  const desktop = popoverPosition({ left: 900, right: 1030, top: 650, bottom: 680 }, { width: 340, height: 300 }, 1100, 720)
  assert.ok(desktop.left >= 12 && desktop.left + desktop.width <= 1088)
  assert.ok(desktop.top >= 12 && desktop.top + 300 <= 708)
  const mobile = popoverPosition({ left: 4, right: 120, top: 600, bottom: 640 }, { width: 340, height: 420 }, 360, 700)
  assert.ok(mobile.left >= 12 && mobile.left + mobile.width <= 348)
  assert.ok(mobile.top >= 12 && mobile.top + 420 <= 688)
  const company = { id: 'A', name: '긴 기업 이름', description: '아주 긴 기업 설명', currentPrice: 11800, monthlyChangeRate: -12 }
  const html = renderToStaticMarkup(createElement(CompanyInfoPopover, { company, open: true, selected: false, onToggle() {}, onClose() {} }))
  assert.match(html, /업종 미등록/); assert.match(html, /기업 설명/); assert.match(html, /월 등락률/); assert.match(html, /-12%/)
})

test('information actions use short visible labels while preserving titled accessible names', async () => {
  const source = await readFile(new URL('../src/intelligence/IntelligenceManager.jsx', import.meta.url), 'utf8')
  assert.match(source, /aria-label=\{`\$\{item\.title\} 정보 수정`\}/)
  assert.match(source, />정보 수정<\/button>/)
  assert.match(source, /aria-label=\{`\$\{item\.title\} 정보 삭제`\}/)
  assert.match(source, />정보 삭제<\/button>/)
  assert.doesNotMatch(source, />\{item\.title\} 수정<\/button>/)
})

test('stage 31 styles keep long descriptions wrapped and popovers internally scrollable', async () => {
  const css = await readFile(new URL('../src/styles/stage31.css', import.meta.url), 'utf8')
  assert.match(css, /overflow-wrap:\s*anywhere/)
  assert.match(css, /max-height:/)
  assert.match(css, /overflow-y:\s*auto/)
  assert.match(css, /@media \(max-width: 40rem\)/)
})
