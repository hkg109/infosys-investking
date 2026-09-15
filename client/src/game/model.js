export const statusLabels = { WAITING: '대기 중', RUNNING: '진행 중', PAUSED: '일시정지', FINISHED: '종료' }
export const controlStates = { start: ['WAITING'], pause: ['RUNNING'], resume: ['PAUSED'], end: ['RUNNING', 'PAUSED'] }
export function allowedControl(action, status) { return controlStates[action]?.includes(status) === true }
export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '—'
  const value = Math.ceil(seconds)
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
}
export function money(value) { return Number.isFinite(value) && value >= 0 ? `${value.toLocaleString('ko-KR')}원` : '—' }
export function remainingSeconds(game, elapsedSeconds = 0) {
  if (!Number.isFinite(game?.remainingSeconds) || game.remainingSeconds < 0) return null
  return Math.max(0, game.remainingSeconds - (game.status === 'RUNNING' ? Math.max(0, elapsedSeconds) : 0))
}
export function validateSnapshot(data) {
  if (!data?.game || !Object.hasOwn(statusLabels, data.game.status)) throw new Error('INVALID_RESPONSE')
  return data
}
