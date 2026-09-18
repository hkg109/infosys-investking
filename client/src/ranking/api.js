const base = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '')
const amount = value => Number.isFinite(value) && value >= 0
const entry = value => value && Number.isInteger(value.rank) && value.rank > 0 && amount(value.totalAssets) && typeof value.isMe === 'boolean'
const publicEntry = ({ rank, totalAssets, isMe }) => ({ rank, totalAssets, isMe })
export function validateRanking(data) {
  const r = data?.ranking
  const invalid = () => { throw new Error('INVALID_RESPONSE') }
  if (!['WAITING', 'RUNNING', 'PAUSED', 'FINISHED'].includes(data?.gameStatus) || !r || typeof r.final !== 'boolean' || !Number.isFinite(Date.parse(r.calculatedAt)) || !Number.isInteger(r.totalParticipants) || r.totalParticipants < 0 || !Array.isArray(r.rankings) || r.rankings.length !== r.totalParticipants || !r.rankings.every(entry) || !Array.isArray(r.top3) || !r.top3.every(entry)) invalid()
  // Validate competition ranking: ties share a rank, then subsequent places skip.
  r.rankings.forEach((person, index) => {
    const previous = r.rankings[index - 1]
    if (previous && previous.totalAssets < person.totalAssets) invalid()
    const expected = previous && previous.totalAssets === person.totalAssets ? previous.rank : index + 1
    if (person.rank !== expected) invalid()
  })
  const top3 = r.rankings.filter(person => person.rank <= 3)
  if (JSON.stringify(top3.map(publicEntry)) !== JSON.stringify(r.top3.map(publicEntry))) invalid()
  const mine = r.rankings.filter(person => person.isMe)
  if (mine.length > 1 || (r.me === null ? mine.length !== 0 : !entry(r.me) || !r.me.isMe || typeof r.me.nickname !== 'string' || !amount(r.me.cash) || !amount(r.me.stockValue) || mine.length !== 1 || r.me.rank !== mine[0].rank || r.me.totalAssets !== mine[0].totalAssets || r.me.cash + r.me.stockValue !== r.me.totalAssets)) invalid()
  // Only retain public fields even if a server accidentally sends extra identity data.
  return {
    gameStatus: data.gameStatus,
    ranking: {
      final: r.final, calculatedAt: r.calculatedAt, totalParticipants: r.totalParticipants,
      top3: top3.map(publicEntry), rankings: r.rankings.map(publicEntry),
      me: r.me === null ? null : { ...publicEntry(r.me), nickname: r.me.nickname, cash: r.me.cash, stockValue: r.me.stockValue },
    },
  }
}
export function rankingFailure(previous, userId, error) {
  const expired = error.message === 'SESSION_REQUIRED'
  return {
    userId,
    data: !expired && previous.userId === userId ? previous.data : null,
    error: expired ? '참가 정보를 확인할 수 없습니다. 다시 로그인해 주세요.' : '순위를 갱신하지 못했습니다. 표시된 결과는 마지막으로 확인한 정보입니다.',
  }
}
export async function getRanking(signal) {
  const response = await fetch(`${base}/api/rankings`, { credentials: 'include', cache: 'no-store', signal })
  if (!response.ok) throw new Error(response.status === 401 ? 'SESSION_REQUIRED' : 'REQUEST_FAILED')
  return validateRanking(await response.json())
}
