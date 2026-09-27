import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { gameMenu } from '../src/navigation/menus.js'

const source = path => readFile(new URL(path, import.meta.url), 'utf8')

test('stage 33 keeps synthesized feedback sounds and icon-only refresh controls', async () => {
  const [sounds, refresh, icon] = await Promise.all([
    source('../src/audio/soundEffects.js'),
    source('../src/components/RefreshIconButton.jsx'),
    source('../public/icons/refresh.svg'),
  ])
  assert.match(sounds, /createOscillator/)
  for (const name of ['breaking', 'orderSuccess', 'purchaseSuccess', 'error', 'monthClose']) assert.match(sounds, new RegExp(`${name}:`))
  assert.match(refresh, /aria-label=/)
  assert.match(refresh, /src="\/icons\/refresh\.svg"/)
  assert.match(icon, /<svg/)
})

test('stage 34 fixes the asset bar and opens one centered order and portfolio workspace', async () => {
  const [page, trading, dashboard, assetBar, css] = await Promise.all([
    source('../src/pages/GamePage.jsx'),
    source('../src/components/TradingPanel.jsx'),
    source('../src/components/UserDashboard.jsx'),
    source('../src/components/AssetStatusBar.jsx'),
    source('../src/styles/stage34.css'),
  ])
  assert.deepEqual(gameMenu.find(([path]) => path === 'market'), ['market', '시장 종목'])
  assert.match(page, /<AssetStatusBar/)
  assert.match(page, /<FloatingGameTimer game=/)
  assert.doesNotMatch(page, /floatingClock|game-clock-bar/)
  assert.match(trading, />주문하기<\/button>/)
  assert.match(trading, /centered width="large"/)
  assert.match(trading, /order-workspace-grid/)
  assert.match(trading, /order-portfolio/)
  assert.doesNotMatch(dashboard, /stats-grid|statusLabels/)
  assert.match(assetBar, /보유 현금/)
  assert.match(assetBar, /주식 평가액/)
  assert.match(assetBar, /총자산/)
  assert.match(css, /position:\s*sticky/)
})
