import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { adminMenu, gameMenu } from '../src/navigation/menus.js'

test('retired missions are absent and information has its own route', () => {
  assert.equal(adminMenu.some(([path]) => path === 'missions'), false)
  assert.equal(gameMenu.some(([path]) => path === 'missions'), false)
  assert.deepEqual(gameMenu.find(([path]) => path === 'intelligence'), ['intelligence', '정보 상점'])
  assert.deepEqual(gameMenu.find(([path]) => path === 'news'), ['news', '뉴스'])
  assert.deepEqual(gameMenu.find(([path]) => path === 'library'), ['library', '보관함'])
  assert.ok(gameMenu.findIndex(([path]) => path === 'news') < gameMenu.findIndex(([path]) => path === 'orders'))
  assert.ok(gameMenu.findIndex(([path]) => path === 'intelligence') < gameMenu.findIndex(([path]) => path === 'library'))
})

test('every menu has one active accessible link at its direct URL', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.navigation-test-'))
  try {
    const outfile = join(directory, 'shell.mjs')
    await build({ entryPoints: ['src/layouts/PageShell.jsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile, jsx: 'automatic' })
    const { default: Shell } = await import(pathToFileURL(outfile))
    for (const [area, menu] of [['admin', adminMenu], ['game', gameMenu]]) {
      for (const [path, label] of menu) {
        const html = renderToStaticMarkup(createElement(MemoryRouter, { initialEntries: [`/${area}/${path}`] }, createElement(Shell, { area, menu, gameState: {} }, 'route body')))
        assert.equal((html.match(/aria-current="page"/g) || []).length, 1)
        assert.ok(html.includes(`href="/${area}/${path}"`))
        assert.ok(html.includes(`${label}</h1>`))
        assert.ok(html.includes('route body'))
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test('market and orders can render only their own dashboard responsibility', async () => {
  const directory = await mkdtemp(join(process.cwd(), '.navigation-test-'))
  try {
    const outfile = join(directory, 'dashboard.mjs')
    await build({ entryPoints: ['src/components/UserDashboard.jsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile, jsx: 'automatic' })
    const { default: Dashboard } = await import(pathToFileURL(outfile))
    const market = renderToStaticMarkup(createElement(Dashboard, { showHoldings: false }))
    const orders = renderToStaticMarkup(createElement(Dashboard, { showMarket: false }))
    assert.ok(market.includes('시장 종목'))
    assert.ok(!market.includes('내 포트폴리오'))
    assert.ok(orders.includes('내 포트폴리오'))
    assert.ok(!orders.includes('시장 종목'))
  } finally { await rm(directory, { recursive: true, force: true }) }
})
