import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = await mkdtemp(join(process.cwd(), '.company-select-test-'))
let CompanySelectMenu, optionIndexAfterKey
try {
  const outfile = join(directory, 'component.mjs')
  await build({ entryPoints: ['src/components/CompanySelectMenu.jsx'], bundle: true, platform: 'node', format: 'esm', packages: 'external', outfile, jsx: 'automatic' })
  ;({ default: CompanySelectMenu, optionIndexAfterKey } = await import(pathToFileURL(outfile).href))
} finally {
  await rm(directory, { recursive: true, force: true })
}

test('custom company menu replaces the native select with an accessible trigger', () => {
  const companies = [{ companyId: 'one', name: '한양양조' }, { companyId: 'two', name: '모빌한양' }]
  const html = renderToStaticMarkup(createElement(CompanySelectMenu, { companies, value: 'two', onChange: () => {} }))
  assert.match(html, /차트 종목/)
  assert.match(html, /모빌한양/)
  assert.match(html, /aria-haspopup="listbox"/)
  assert.doesNotMatch(html, /<select/)
})

test('custom company menu keyboard index wraps and supports Home and End', () => {
  assert.equal(optionIndexAfterKey(-1, 3, 'ArrowDown'), 0)
  assert.equal(optionIndexAfterKey(2, 3, 'ArrowDown'), 0)
  assert.equal(optionIndexAfterKey(0, 3, 'ArrowUp'), 2)
  assert.equal(optionIndexAfterKey(1, 3, 'Home'), 0)
  assert.equal(optionIndexAfterKey(1, 3, 'End'), 2)
  assert.equal(optionIndexAfterKey(0, 0, 'ArrowDown'), -1)
})

test('home screen uses the event title and organizer copy', async () => {
  const source = await readFile('src/pages/HomePage.jsx', 'utf8')
  assert.match(source, /정보시스템학과 투자왕/)
  assert.match(source, /한양대학교 정보시스템학과 16대 학생회 휘연 주최/)
  assert.doesNotMatch(source, /뉴스를 읽고,/)
})
