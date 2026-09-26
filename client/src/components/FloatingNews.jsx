import { useEffect, useRef, useState } from 'react'
import { EventArticle } from '../events/EventNews'
import useEventNews from '../events/useEventNews'
import { clampNewsRect, defaultNewsRect, loadNewsRect, newsViewportSize, saveNewsRect } from '../game/floatingNews'

function browserStorage() {
  try { return window.localStorage } catch { return null }
}

export function FloatingNewsFeed({ game, events, error, loading, onRetry, onOpenFull }) {
  return <div className="floating-news__feed">
    <div className="floating-news__summary">
      <div><span>MARKET WIRE</span><strong>{game?.currentRound > 0 ? `${game.currentRound}월 속보` : '시장 대기'}</strong></div>
      <button type="button" onClick={onOpenFull}>뉴스 탭 열기</button>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!events.length ? <p className="floating-news__empty">{game?.status === 'WAITING' ? '게임 시작 후 뉴스가 공개됩니다.' : loading ? '이번 달 뉴스를 확인하고 있습니다.' : '이번 달에 공개된 뉴스가 없습니다.'}</p> : events.map(event => <EventArticle key={event.gameEventId || event.eventId} event={event} />)}
    <button type="button" className="floating-news__refresh" disabled={loading} onClick={onRetry}>{loading ? '확인 중…' : '뉴스 업데이트'}</button>
  </div>
}

export default function FloatingNews({ game, revision, onClose, onOpenFull }) {
  const initial = () => typeof window === 'undefined' ? defaultNewsRect() : loadNewsRect(browserStorage(), newsViewportSize(window))
  const [rect, setRect] = useState(initial)
  const [minimized, setMinimized] = useState(false)
  const rectRef = useRef(rect)
  const interaction = useRef(null)
  const feed = useEventNews({ game, revision })

  const updateRect = (next) => {
    const safe = clampNewsRect(next, typeof window === 'undefined' ? undefined : newsViewportSize(window))
    rectRef.current = safe
    setRect(safe)
  }

  useEffect(() => {
    const keepVisible = () => {
      const safe = clampNewsRect(rectRef.current, newsViewportSize(window))
      rectRef.current = safe
      setRect(safe)
      saveNewsRect(browserStorage(), safe)
    }
    const closeOnEscape = event => { if (event.key === 'Escape') onClose() }
    window.addEventListener('resize', keepVisible)
    window.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('resize', keepVisible)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])

  const begin = (kind, event) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    interaction.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startRect: rectRef.current }
  }
  const move = event => {
    const current = interaction.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    updateRect(current.kind === 'move'
      ? { ...current.startRect, x: current.startRect.x + dx, y: current.startRect.y + dy }
      : { ...current.startRect, width: current.startRect.width + dx, height: current.startRect.height + dy })
  }
  const finish = event => {
    if (!interaction.current || interaction.current.pointerId !== event.pointerId) return
    interaction.current = null
    if (typeof window !== 'undefined') saveNewsRect(browserStorage(), rectRef.current)
  }
  const keyboardAdjust = (kind, event) => {
    const amount = event.shiftKey ? 20 : 8
    const delta = { ArrowLeft: [-amount, 0], ArrowRight: [amount, 0], ArrowUp: [0, -amount], ArrowDown: [0, amount] }[event.key]
    if (!delta) return
    event.preventDefault()
    const current = rectRef.current
    updateRect(kind === 'move'
      ? { ...current, x: current.x + delta[0], y: current.y + delta[1] }
      : { ...current, width: current.width + delta[0], height: current.height + delta[1] })
    saveNewsRect(browserStorage(), rectRef.current)
  }
  const reset = () => {
    if (typeof window === 'undefined') return
    const next = defaultNewsRect(newsViewportSize(window))
    updateRect(next)
    saveNewsRect(browserStorage(), next)
  }

  return <aside
    className={`floating-news${minimized ? ' floating-news--minimized' : ''}`}
    aria-label="플로팅 시장 뉴스"
    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
  >
    <header className="floating-news__header">
      <div className="floating-news__drag" role="button" tabIndex="0" aria-label="뉴스 창 이동 손잡이" title="드래그하거나 방향키로 뉴스 창 이동" onPointerDown={event => begin('move', event)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={event => keyboardAdjust('move', event)}>
        <span aria-hidden="true">⋮⋮</span><strong>LIVE NEWS</strong>
      </div>
      <div className="floating-news__controls">
        <button type="button" onClick={reset}>초기화</button>
        <button type="button" aria-expanded={!minimized} onClick={() => setMinimized(value => !value)}>{minimized ? '펼치기' : '최소화'}</button>
        <button type="button" onClick={onClose}>닫기</button>
      </div>
    </header>
    {!minimized && <FloatingNewsFeed game={game} events={feed.events} error={feed.error} loading={feed.loading} onRetry={feed.refresh} onOpenFull={onOpenFull} />}
    {!minimized && <div className="floating-news__resize" role="separator" tabIndex="0" aria-label="뉴스 창 크기 조절 손잡이" title="드래그하거나 방향키로 뉴스 창 크기 조절" onPointerDown={event => begin('resize', event)} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} onKeyDown={event => keyboardAdjust('resize', event)} />}
  </aside>
}
