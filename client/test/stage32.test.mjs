import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { validateAllPriceHistories } from '../src/trading/historyApi.js'

const period = {
  round: 1, openingPrice: 10000, closingPrice: 11000, changeRate: 10,
  snapshots: [
    { snapshotType: 'OPEN', price: 10000, changeRate: 0, recordedAt: '2026-09-27T07:00:00.000Z' },
    { snapshotType: 'CLOSE', price: 11000, changeRate: 10, recordedAt: '2026-09-27T07:10:00.000Z' },
  ],
}
const item = id => ({ company: { companyId: id, name: `${id} 기업`, description: '', active: true }, history: [period] })

test('all-company response rejects empty, duplicate, and inactive company contracts', () => {
  assert.throws(() => validateAllPriceHistories({ companies: [] }))
  assert.throws(() => validateAllPriceHistories({ companies: [item('A'), item('A')] }))
  assert.throws(() => validateAllPriceHistories({ companies: [{ ...item('A'), company: { ...item('A').company, active: false } }] }))
  assert.equal(validateAllPriceHistories({ companies: [item('A'), item('B')] }).companies.length, 2)
})

test('stage 32 UI keeps legend, pattern, event marker, selection and mobile overflow contracts', async () => {
  const component = await readFile(new URL('../src/trading/PriceHistoryPanel.jsx', import.meta.url), 'utf8')
  const model = await readFile(new URL('../src/trading/marketHistoryModel.js', import.meta.url), 'utf8')
  const css = await readFile(new URL('../src/styles/stage32.css', import.meta.url), 'utf8')
  assert.match(component, /aria-label="기업 주가선 선택"/)
  assert.match(component, /aria-pressed=\{companyId === group\.company\.companyId\}/)
  assert.match(component, /company-series__point--event/)
  assert.match(component, /id === companyId \? '' : id/)
  assert.match(model, /A: \{ color:/)
  assert.match(model, /G: \{ color:/)
  assert.match(model, /dash:/)
  assert.match(css, /company-series--muted/)
  assert.match(css, /overflow-x:\s*auto/)
  assert.match(css, /@media \(max-width: 40rem\)/)
})
