const statuses = new Set(['WAITING', 'RUNNING', 'PAUSED', 'FINISHED'])
const phases = new Set(['WAITING', 'TRADING', 'RESULT', 'PAUSED', 'FINISHED'])
const finite = value => Number.isFinite(value)
const nonnegative = value => Number.isSafeInteger(value) && value >= 0
const iso = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
const publicText = value => typeof value === 'string'

export function validateBroadcast(data) {
  const game = data?.game
  const ranking = data?.ranking
  if (data?.version !== 1 || !iso(data.serverTime) || !nonnegative(data.pollAfterMs) || data.pollAfterMs < 250 ||
      !game || !statuses.has(game.status) || (game.phase !== null && !phases.has(game.phase)) ||
      !nonnegative(game.currentRound) || !nonnegative(game.totalRounds) || game.currentRound > game.totalRounds ||
      (game.remainingSeconds !== null && !nonnegative(game.remainingSeconds)) ||
      typeof game.tradingHalted !== 'boolean' || typeof game.tradingEnabled !== 'boolean' ||
      (game.phaseEndsAt !== null && !iso(game.phaseEndsAt)) || !Array.isArray(data.market) ||
      !ranking || typeof ranking.final !== 'boolean' || !nonnegative(ranking.totalParticipants) ||
      !Array.isArray(ranking.top3) || !Array.isArray(ranking.rankings) ||
      !Array.isArray(data.news) || !Array.isArray(data.warnings) || !Array.isArray(data.results)) throw new Error('INVALID_RESPONSE')
  for (const stock of data.market) {
    if (!publicText(stock?.companyId) || !publicText(stock.name) || !finite(stock.currentPrice) || stock.currentPrice <= 0 ||
        !finite(stock.openingPrice) || stock.openingPrice <= 0 || !finite(stock.changeRate)) throw new Error('INVALID_RESPONSE')
  }
  for (const person of [...ranking.top3, ...ranking.rankings]) {
    if (!Number.isSafeInteger(person?.rank) || person.rank < 1 || !nonnegative(person.totalAssets) || Object.keys(person).some(key => !['rank', 'totalAssets'].includes(key))) throw new Error('INVALID_RESPONSE')
  }
  if (ranking.rankings.length !== ranking.totalParticipants || ranking.top3.some(person => person.rank > 3)) throw new Error('INVALID_RESPONSE')
  for (const item of data.news) if (!publicText(item?.gameEventId) || !publicText(item.title) || !publicText(item.news) || !['INTRADAY', 'CLOSE'].includes(item.triggerPhase)) throw new Error('INVALID_RESPONSE')
  for (const item of data.warnings) if (!publicText(item?.gameEventId) || !iso(item.scheduledAt) || Object.keys(item).some(key => !['gameEventId', 'scheduledAt'].includes(key))) throw new Error('INVALID_RESPONSE')
  for (const item of data.results) {
    if (!publicText(item?.gameEventId) || !publicText(item.title) || !publicText(item.result) || !iso(item.appliedAt) ||
        !['INTRADAY', 'CLOSE'].includes(item.triggerPhase) || !Array.isArray(item.changes)) throw new Error('INVALID_RESPONSE')
    for (const change of item.changes) if (!publicText(change?.companyId) || !finite(change.previousPrice) || !finite(change.newPrice) || !finite(change.changeRate)) throw new Error('INVALID_RESPONSE')
  }
  return data
}

export function sceneFor(data, spotlight = null) {
  if (!data) return 'loading'
  if (data.game.status === 'WAITING') return 'waiting'
  if (data.game.status === 'FINISHED') return data.ranking.final ? 'final' : 'finalizing'
  if (data.game.status === 'PAUSED') return 'paused'
  if (spotlight?.kind === 'result') return 'breaking'
  if (spotlight?.kind === 'warning') return 'warning'
  if (data.game.phase === 'RESULT') return 'result'
  return 'market'
}

export function nextSpotlight(previous, next, now = Date.now()) {
  if (!previous || next.game.status === 'WAITING') return null
  const oldResults = new Set(previous.results.map(item => item.gameEventId))
  const result = next.results.findLast(item => !oldResults.has(item.gameEventId))
  if (result) return { kind: 'result', eventId: result.gameEventId, until: now + 6500 }
  const oldWarnings = new Set(previous.warnings.map(item => item.gameEventId))
  const warning = next.warnings.find(item => !oldWarnings.has(item.gameEventId))
  return warning ? { kind: 'warning', eventId: warning.gameEventId, until: now + 4500 } : null
}

export function broadcastSeconds(data, now = Date.now()) {
  if (!data || data.game.remainingSeconds === null) return null
  if (data.game.status !== 'RUNNING' || !data.game.phaseEndsAt) return data.game.remainingSeconds
  const serverOffset = Date.parse(data.serverTime) - data.receivedAt
  return Math.max(0, Math.ceil((Date.parse(data.game.phaseEndsAt) - (now + serverOffset)) / 1000))
}

export function retryDelay(failures) { return Math.min(8000, 2000 * 2 ** Math.max(0, failures - 1)) }
