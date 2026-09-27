import { useEffect, useRef, useState } from 'react'
import { formatTime, statusLabels } from '../game/model'
import { clampTimerRect, defaultTimerRect, loadTimerRect, saveTimerRect, viewportSize } from '../game/floatingTimer'

function browserStorage() {
  try { return window.localStorage } catch { return null }
}

function tradingLabel(game) {
  if (game?.status === 'PAUSED') return '거래 일시정지'
  if (game?.status !== 'RUNNING') return game?.status === 'FINISHED' ? '거래 종료' : '거래 대기'
  return game.tradingEnabled === true ? '거래 가능' : game.tradingEnabled === false ? '거래 마감' : '거래 확인 중'
}

export default function FloatingGameTimer({ game }) {
  const initial = () => typeof window === 'undefined'
    ? defaultTimerRect()
    : loadTimerRect(browserStorage(), viewportSize(window))
  const [rect, setRect] = useState(initial)
  const rectRef = useRef(rect)
  const interaction = useRef(null)

  const updateRect = (next) => {
    const safe = clampTimerRect(next, typeof window === 'undefined' ? undefined : viewportSize(window))
    rectRef.current = safe
    setRect(safe)
  }

  useEffect(() => {
    const keepVisible = () => {
      const safe = clampTimerRect(rectRef.current, viewportSize(window))
      rectRef.current = safe
      setRect(safe)
      saveTimerRect(browserStorage(), safe)
    }
    window.addEventListener('resize', keepVisible)
    return () => window.removeEventListener('resize', keepVisible)
  }, [])

  const begin = (kind, event) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    interaction.current = { kind, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startRect: rectRef.current }
  }
  const move = (event) => {
    const current = interaction.current
    if (!current || current.pointerId !== event.pointerId) return
    const dx = event.clientX - current.startX
    const dy = event.clientY - current.startY
    updateRect(current.kind === 'move'
      ? { ...current.startRect, x: current.startRect.x + dx, y: current.startRect.y + dy }
      : { ...current.startRect, width: current.startRect.width + dx, height: current.startRect.height + dy })
  }
  const finish = (event) => {
    if (!interaction.current || interaction.current.pointerId !== event.pointerId) return
    interaction.current = null
    if (typeof window !== 'undefined') saveTimerRect(browserStorage(), rectRef.current)
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
    saveTimerRect(browserStorage(), rectRef.current)
  }
  const reset = () => {
    if (typeof window === 'undefined') return
    const next = defaultTimerRect(viewportSize(window))
    updateRect(next)
    saveTimerRect(browserStorage(), next)
  }
  const round = Number.isInteger(game?.currentRound) && game.currentRound > 0 ? `${game.currentRound}월` : '—'

  return <aside
    className="floating-timer"
    aria-label="게임 타이머"
    style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height }}
  >
    <div className="floating-timer__handle">
      <div
        className="floating-timer__drag"
        role="button"
        tabIndex="0"
        aria-label="타이머 이동 손잡이"
        title="드래그하거나 방향키로 타이머 이동"
        onPointerDown={(event) => begin('move', event)}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onKeyDown={(event) => keyboardAdjust('move', event)}
      >
        <span>⋮⋮</span>
        <strong>GAME CLOCK</strong>
      </div>
      <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={reset}>위치 초기화</button>
    </div>
    <div className="floating-timer__body">
      <div><span>현재 월</span><strong>{round}</strong></div>
      <div><span>남은 시간</span><strong className="floating-timer__clock">{formatTime(game?.remainingSeconds)}</strong></div>
    </div>
    <div className="floating-timer__footer">
      <span>{statusLabels[game?.status] || '상태 확인 중'}</span>
      <span className={game?.status === 'RUNNING' && game.tradingEnabled === true ? 'is-open' : ''}>{tradingLabel(game)}</span>
    </div>
    <div
      className="floating-timer__resize"
      role="separator"
      tabIndex="0"
      aria-label="타이머 크기 조절 손잡이"
      title="드래그하거나 방향키로 타이머 크기 조절"
      onPointerDown={(event) => begin('resize', event)}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={finish}
      onKeyDown={(event) => keyboardAdjust('resize', event)}
    />
  </aside>
}
