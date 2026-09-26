import { useEffect, useId, useRef, useState } from 'react'

export function optionIndexAfterKey(current, length, key) {
  if (length < 1) return -1
  if (key === 'Home') return 0
  if (key === 'End') return length - 1
  if (key === 'ArrowDown') return current < 0 ? 0 : (current + 1) % length
  if (key === 'ArrowUp') return current < 0 ? length - 1 : (current - 1 + length) % length
  return current
}

export default function CompanySelectMenu({ companies = [], value = '', onChange, label = '차트 종목' }) {
  const labelId = useId()
  const listboxId = useId()
  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const listboxRef = useRef(null)
  const [open, setOpen] = useState(false)
  const selectedIndex = companies.findIndex(company => company.companyId === value)
  const [activeIndex, setActiveIndex] = useState(selectedIndex)
  const selected = selectedIndex >= 0 ? companies[selectedIndex] : null

  useEffect(() => {
    setActiveIndex(selectedIndex)
  }, [selectedIndex])

  useEffect(() => {
    if (!open) return undefined
    listboxRef.current?.focus({ preventScroll: true })
    const closeOutside = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  const openAt = index => {
    if (!companies.length) return
    setActiveIndex(index)
    setOpen(true)
  }
  const choose = index => {
    const company = companies[index]
    if (!company) return
    onChange(company.companyId)
    setOpen(false)
  }
  const handleButtonKeyDown = event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      openAt(optionIndexAfterKey(selectedIndex, companies.length, event.key))
    }
  }
  const handleListKeyDown = event => {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault()
      setActiveIndex(index => optionIndexAfterKey(index, companies.length, event.key))
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      choose(activeIndex)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus({ preventScroll: true })
      return
    }
    if (event.key === 'Tab') {
      setOpen(false)
    }
  }

  return <div className="company-select" ref={rootRef}>
    <span className="company-select__label" id={labelId}>{label}</span>
    <button
      type="button"
      ref={triggerRef}
      className="company-select__trigger"
      aria-labelledby={`${labelId} ${listboxId}-value`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listboxId}
      disabled={!companies.length}
      onClick={() => open ? setOpen(false) : openAt(selectedIndex >= 0 ? selectedIndex : 0)}
      onKeyDown={handleButtonKeyDown}
    >
      <span id={`${listboxId}-value`}>{selected?.name || (companies.length ? '종목 선택' : '표시할 종목 없음')}</span>
      <span className="company-select__chevron" aria-hidden="true" />
    </button>
    {open && <ul
      className="company-select__options"
      id={listboxId}
      ref={listboxRef}
      role="listbox"
      tabIndex="-1"
      aria-labelledby={labelId}
      aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
      onKeyDown={handleListKeyDown}
    >
      {companies.map((company, index) => <li
        key={company.companyId}
        id={`${listboxId}-option-${index}`}
        className="company-select__option"
        role="option"
        aria-selected={company.companyId === value}
        data-active={index === activeIndex || undefined}
        onPointerMove={() => setActiveIndex(index)}
        onClick={() => choose(index)}
      >
        <span>{company.name}</span>
        {company.companyId === value && <span className="company-select__selected" aria-hidden="true">선택됨</span>}
      </li>)}
    </ul>}
  </div>
}
