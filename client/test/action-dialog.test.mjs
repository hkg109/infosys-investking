import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const dir = await mkdtemp(join(process.cwd(), '.action-dialog-test-'))
let ActionDialog, ConfirmDialog
try {
  const output = join(dir, 'ActionDialog.mjs')
  await build({ entryPoints: ['src/components/ActionDialog.jsx'], outfile: output, bundle: true, platform: 'node', format: 'esm', packages: 'external', jsx: 'automatic' })
  ;({ default: ActionDialog, ConfirmDialog } = await import(pathToFileURL(output).href))
} finally { await rm(dir, { recursive: true, force: true }) }

test('action dialog exposes an accessible modal only while open', () => {
  assert.equal(renderToStaticMarkup(createElement(ActionDialog, { open: false, title: '수정', onClose() {} }, '내용')), '')
  const html = renderToStaticMarkup(createElement(ActionDialog, { open: true, title: '종목 수정', eyebrow: 'COMPANY', onClose() {} }, createElement('input', { 'data-autofocus': true })))
  assert.match(html, /role="dialog"/)
  assert.match(html, /aria-modal="true"/)
  assert.match(html, /aria-labelledby=/)
  assert.match(html, /종목 수정 닫기/)
  assert.match(html, /data-autofocus="true"/)
})

test('confirmation dialog keeps destructive confirmation disabled until allowed', () => {
  const html = renderToStaticMarkup(createElement(ConfirmDialog, { open: true, title: '삭제', onCancel() {}, onConfirm() {}, confirmDisabled: true, danger: true, confirmLabel: '삭제 확정' }, '복구할 수 없습니다.'))
  assert.match(html, /action-dialog--danger/)
  assert.match(html, /disabled=""/)
  assert.match(html, /삭제 확정/)
})
