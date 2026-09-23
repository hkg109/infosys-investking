import { useEffect, useId, useRef, useState } from 'react'

export default function ActionDialog({ open, title, eyebrow, children, onClose, busy = false, dirty = false, tone = 'default', width = 'medium' }) {
  const titleId = useId()
  const dialogRef = useRef(null)
  const returnFocus = useRef(null)
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  const dirtyRef = useRef(dirty)
  const [confirmClose, setConfirmClose] = useState(false)
  closeRef.current = onClose
  busyRef.current = busy
  dirtyRef.current = dirty

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined
    returnFocus.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = dialogRef.current
    const focusable = dialog?.querySelector('[data-autofocus], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]')
    focusable?.focus()
    const keydown = event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busyRef.current) dirtyRef.current ? setConfirmClose(true) : closeRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const items = [...dialog.querySelectorAll('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [href]')]
      if (!items.length) return
      const first = items[0]
      const last = items.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      document.body.style.overflow = previousOverflow
      returnFocus.current?.focus?.()
    }
  }, [open])

  useEffect(() => { if (!open) setConfirmClose(false) }, [open])
  if (!open) return null
  const requestClose = () => {
    if (busyRef.current) return
    if (dirtyRef.current) setConfirmClose(true)
    else closeRef.current()
  }
  return <div className="action-dialog-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) requestClose() }}>
    <section ref={dialogRef} className={`action-dialog action-dialog--${width} action-dialog--${tone}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy}>
      <header className="action-dialog__header">
        <div>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<h2 id={titleId}>{title}</h2></div>
        <button type="button" className="icon-button" data-dialog-close aria-label={`${title} 닫기`} disabled={busy} onClick={requestClose}><span aria-hidden="true">×</span></button>
      </header>
      <div className="action-dialog__body">{children}</div>
      {confirmClose && <div className="action-dialog__guard" role="alertdialog" aria-label="작성 중인 내용 닫기 확인">
        <strong>작성 중인 내용이 있습니다.</strong><p>지금 닫으면 저장하지 않은 변경사항이 사라집니다.</p>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setConfirmClose(false)}>계속 편집</button><button type="button" className="danger-button" onClick={onClose}>변경사항 버리기</button></div>
      </div>}
    </section>
  </div>
}

export function requestDialogClose(event) {
  event.currentTarget.closest('[role="dialog"]')?.querySelector('[data-dialog-close]')?.click()
}

export function ConfirmDialog({ open, title, children, onCancel, onConfirm, busy = false, confirmDisabled = false, confirmLabel = '확인', danger = false }) {
  return <ActionDialog open={open} title={title} eyebrow="CONFIRM" onClose={onCancel} busy={busy} tone={danger ? 'danger' : 'default'} width="small">
    <div className="confirm-dialog__content">{children}</div>
    <div className="dialog-actions"><button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>취소</button><button type="button" className={danger ? 'danger-button' : 'primary-button'} disabled={busy || confirmDisabled} onClick={onConfirm}>{busy ? '처리 중...' : confirmLabel}</button></div>
  </ActionDialog>
}
