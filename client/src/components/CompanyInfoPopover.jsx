import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { money } from '../game/model'

const margin = 12
export function popoverPosition(anchor, card, viewportWidth, viewportHeight, compact = viewportWidth < 640) {
  const width = Math.min(card.width || 340, viewportWidth - margin * 2)
  const height = Math.min(card.height || 300, viewportHeight - margin * 2)
  let left
  let top
  if (compact) {
    left = Math.max(margin, (viewportWidth - width) / 2)
    top = Math.max(margin, viewportHeight - height - margin)
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
  const monthlyChangeRate = Number.isFinite(company.monthlyChangeRate) ? company.monthlyChangeRate : company.changeRate

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
    const outside = event => {
      if (!cardRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) closeAndRestore()
    }
    document.addEventListener('keydown', escape)
    document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('keydown', escape); document.removeEventListener('pointerdown', outside) }
  }, [open])

  return <div className="company-info-anchor">
    <button ref={triggerRef} type="button" className="stock-select" aria-expanded={open} aria-controls={open ? 'market-company-info' : undefined} aria-haspopup="dialog" aria-pressed={selected} onClick={onToggle}>
      {company.name}<small>{company.id}</small>
    </button>
    {open && <aside ref={cardRef} id="market-company-info" className="company-info-popover" role="dialog" aria-label={`${company.name} 기업 설명`} style={position ? { left: position.left, top: position.top, width: position.width } : { visibility: 'hidden' }}>
      <header><div><span>{company.id}</span><h3>{company.name}</h3><p className="company-info-popover__industry">{company.industry || '업종 미등록'}</p></div><button type="button" className="company-info-popover__close" aria-label="기업 설명 닫기" onClick={closeAndRestore}>×</button></header>
      <section className="company-info-popover__description" aria-label="기업 설명"><strong>기업 설명</strong><p>{company.description || '등록된 기업 설명이 없습니다.'}</p></section>
      <dl><div><dt>현재가</dt><dd>{money(company.currentPrice)}</dd></div><div><dt>월 등락률</dt><dd className={monthlyChangeRate > 0 ? 'market-up' : monthlyChangeRate < 0 ? 'market-down' : ''}>{Number.isFinite(monthlyChangeRate) ? `${monthlyChangeRate > 0 ? '+' : ''}${monthlyChangeRate}%` : '—'}</dd></div></dl>
      <button type="button" className="secondary-button company-info-popover__trade" onClick={() => { onTrade?.(company.id); onClose?.() }}>주문 화면으로 이동</button>
    </aside>}
  </div>
}
