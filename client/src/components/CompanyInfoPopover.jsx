import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { money } from '../game/model'

const margin = 12
export function popoverPosition(anchor, card, viewportWidth, viewportHeight, compact = viewportWidth < 640) {
  const width = Math.min(card.width || 320, viewportWidth - margin * 2)
  const height = card.height || 220
  let left
  let top
  if (compact) {
    left = Math.min(Math.max(margin, anchor.left), Math.max(margin, viewportWidth - width - margin))
    top = anchor.bottom + 8
    if (top + height > viewportHeight - margin) top = Math.max(margin, anchor.top - height - 8)
  } else {
    left = anchor.right + 10
    if (left + width > viewportWidth - margin) left = Math.max(margin, anchor.left - width - 10)
    top = Math.min(Math.max(margin, anchor.top), Math.max(margin, viewportHeight - height - margin))
  }
  return { left, top, width }
}

export default function CompanyInfoPopover({ company, open, selected, onToggle, onClose, onTrade }) {
  const triggerRef = useRef(null)
  const cardRef = useRef(null)
  const [position, setPosition] = useState(null)
  const closeAndRestore = () => {
    onClose?.()
    globalThis.requestAnimationFrame?.(() => triggerRef.current?.focus())
  }

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !cardRef.current || typeof window === 'undefined') return undefined
    const update = () => setPosition(popoverPosition(
      triggerRef.current.getBoundingClientRect(), cardRef.current.getBoundingClientRect(), window.innerWidth, window.innerHeight,
    ))
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => { window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true) }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const escape = event => { if (event.key === 'Escape') closeAndRestore() }
    document.addEventListener('keydown', escape)
    return () => document.removeEventListener('keydown', escape)
  })

  return <div className="company-info-anchor">
    <button ref={triggerRef} type="button" className="stock-select" aria-expanded={open} aria-controls={open ? 'market-company-info' : undefined} aria-haspopup="dialog" aria-pressed={selected} onClick={onToggle}>
      {company.name}<small>{company.id}</small>
    </button>
    {open && <aside ref={cardRef} id="market-company-info" className="company-info-popover" role="dialog" aria-label={`${company.name} 기업 설명`} style={position ? { left: position.left, top: position.top, width: position.width } : { visibility: 'hidden' }}>
      <header><div><span>{company.id}</span><h3>{company.name}</h3></div><button type="button" className="company-info-popover__close" aria-label="기업 설명 닫기" onClick={closeAndRestore}>×</button></header>
      <p>{company.description || '등록된 기업 설명이 없습니다.'}</p>
      <dl><div><dt>현재가</dt><dd>{money(company.currentPrice)}</dd></div><div><dt>초기 대비</dt><dd className={company.changeRate > 0 ? 'market-up' : company.changeRate < 0 ? 'market-down' : ''}>{Number.isFinite(company.changeRate) ? `${company.changeRate > 0 ? '+' : ''}${company.changeRate}%` : '—'}</dd></div></dl>
      <button type="button" className="secondary-button company-info-popover__trade" onClick={() => { onTrade?.(company.id); onClose?.() }}>주문 화면으로 이동</button>
    </aside>}
  </div>
}
