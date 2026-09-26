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
