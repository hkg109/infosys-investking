import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const source = path => readFile(new URL(path, import.meta.url), 'utf8')

test('stage 35 renders a three-column RPG library and hides purchased content behind a reader', async () => {
  const [panel, manager, css] = await Promise.all([
    source('../src/intelligence/IntelligencePanel.jsx'),
    source('../src/intelligence/IntelligenceManager.jsx'),
    source('../src/styles/stage35-36.css'),
  ])
  assert.match(css, /intelligence-library__grid[\s\S]*repeat\(3,/)
  assert.match(panel, />정보 읽기<\/button>/)
  assert.match(panel, /<ActionDialog[\s\S]*IntelligenceLibraryDetail/)
  assert.doesNotMatch(panel.match(/export function IntelligenceLibrary\([\s\S]*?export function IntelligenceLibraryDetail/)?.[0] || '', /item\.content/)
  assert.match(manager, /<option value="">연관없음<\/option>/)
  assert.match(manager, /name="eventId"/)
})

test('stage 36 keeps admin controls in tables and shows every trading month including empty months', async () => {
  const [events, schedule, intelligence, companies, history] = await Promise.all([
    source('../src/events/EventManager.jsx'),
    source('../src/events/ScheduleEditor.jsx'),
    source('../src/intelligence/IntelligenceManager.jsx'),
    source('../src/companies/CompanyManager.jsx'),
    source('../src/trading/TradeHistoryPanel.jsx'),
  ])
  assert.match(events, /event-admin-table/)
  assert.doesNotMatch(events, />발생</)
  assert.match(schedule, /schedule-draft-table/)
  assert.match(schedule, /schedule-saved-table/)
  assert.match(schedule, /뉴스 공개/)
  assert.match(schedule, /주가 변동/)
  assert.match(intelligence, /intelligence-admin-table/)
  assert.match(companies, /company-admin-table/)
  assert.match(history, /trade-month-table/)
  assert.match(history, /거래 없음/)
  assert.match(history, /Array\.from\(\{ length: Math\.max\(1, totalRounds\) \}/)
})
