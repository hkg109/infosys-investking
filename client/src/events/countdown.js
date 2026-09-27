export function eventCountdown(event, game, elapsedSeconds = 0) {
  if (event.applied) return '반영 완료'
  if (game?.status === 'FINISHED' || (game?.phase === 'RESULT' && event.round === game.currentRound)) return '결과 반영 확인 중'
  const phase = game?.status === 'PAUSED' ? game.phaseBeforePause : game?.phase
  if (phase !== 'TRADING' || !Number.isFinite(game?.remainingSeconds)) return '반영 시각 확인 중'
  const target = event.triggerPhase === 'INTRADAY' ? event.triggerOffsetSeconds : game.tradingDurationSeconds
  if (!Number.isFinite(target)) return '반영 시각 확인 중'
  const progressed = game.tradingDurationSeconds - game.remainingSeconds + (game.status === 'RUNNING' ? Math.max(0, elapsedSeconds) : 0)
  const seconds = Math.max(0, Math.ceil(target - progressed))
  if (!seconds) return '주가 반영 확인 중'
  return `${game.status === 'PAUSED' ? '일시정지 · ' : ''}${event.triggerPhase === 'INTRADAY' ? '사건 반영' : '거래 마감'}까지 ${seconds}초`
}
