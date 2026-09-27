export function marketNotice(payload) {
  const gameEventId = typeof payload?.gameEventId === 'string' ? payload.gameEventId.trim() : ''
  const title = typeof payload?.title === 'string' ? payload.title.trim() : ''
  if (!gameEventId || gameEventId.length > 100 || !title || title.length > 100 || payload?.triggerPhase !== 'INTRADAY') return null
  return { gameEventId, title }
}

export function appendMarketNotice(notices, payload, limit = 3) {
  const notice = marketNotice(payload)
  if (!notice || notices.some(item => item.gameEventId === notice.gameEventId)) return notices
  return [...notices, notice].slice(-limit)
}

const states = new Set(['WARNING', 'HALTED', 'APPLYING', 'CLOSED'])
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

export function mergeMarketNotice(notices, payload, state, receivedAt = Date.now(), limit = 3) {
  if (!states.has(state)) return notices
  const gameEventId = typeof payload?.gameEventId === 'string' ? payload.gameEventId.trim() : ''
  if (!gameEventId || gameEventId.length > 100) return notices
  const current = notices.find(item => item.gameEventId === gameEventId)
  const title = typeof payload?.title === 'string' && payload.title.trim() ? payload.title.trim() : current?.title
  if (!title || title.length > 100) return notices
  const scheduledAt = validDate(payload?.scheduledAt) ? new Date(payload.scheduledAt).toISOString() : current?.scheduledAt || null
  const haltedAt = validDate(payload?.haltedAt) ? Date.parse(payload.haltedAt) : null
  const haltEndsAt = state === 'HALTED' && haltedAt !== null && Number.isFinite(payload?.haltDurationSeconds)
    ? haltedAt + Math.max(0, payload.haltDurationSeconds) * 1000
    : current?.haltEndsAt || null
  const next = {
    gameEventId,
    title,
    scheduledAt,
    haltEndsAt,
    state,
    updatedAt: Number.isFinite(receivedAt) ? receivedAt : Date.now(),
    ...(state === 'CLOSED' ? { closedAt: validDate(payload?.serverTime) ? Date.parse(payload.serverTime) : receivedAt } : {}),
  }
  return [...notices.filter(item => item.gameEventId !== gameEventId), next].slice(-limit)
}

export function marketNoticeStatus(notice, serverNow = Date.now()) {
  if (notice?.state === 'HALTED') {
    const remaining = Number.isFinite(notice.haltEndsAt) ? Math.max(0, Math.ceil((notice.haltEndsAt - serverNow) / 1000)) : null
    return remaining === null ? '사건 처리 중 · 거래 일시정지' : remaining > 0 ? `사건 처리 중 · 거래 일시정지 · ${clock(remaining)} 후 재개` : '사건 처리 중 · 거래 재개 확인 중'
  }
  if (notice?.state === 'APPLYING') return '속보 발생 · 주가 반영 중'
  if (notice?.state === 'CLOSED') return '마감됨 · 거래가 재개되었습니다'
  const scheduled = Date.parse(notice?.scheduledAt)
  if (!Number.isFinite(scheduled)) return '속보 예정 · 발생 시각 확인 중'
  const seconds = Math.max(0, Math.ceil((scheduled - serverNow) / 1000))
  if (seconds === 0) return '속보 발생 · 주가 반영 중'
  return `속보 예정 · ${clock(seconds)} 후 발생`
}
