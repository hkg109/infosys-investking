import { useEffect, useState } from 'react'
import Panel from '../components/Panel'
import { money } from '../game/model'
import { getRanking, rankingFailure } from './api'

export default function RankingPanel({ userId, game, revision }) {
  const [state, setState] = useState({ userId, data: null, error: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)
    getRanking(controller.signal).then(data => {
      if (active) setState({ userId, data, error: '' })
    }).catch(error => {
      if (active) setState(previous => rankingFailure(previous, userId, error))
    }).finally(() => clearTimeout(timeout))
    return () => { active = false; clearTimeout(timeout); controller.abort() }
  }, [userId, revision, retry])
  const current = state.userId === userId ? state : { data: null, error: '' }
  return <Panel title={current.data?.ranking.final ? '최종 투자 결과' : '투자 순위'}>
    {current.error && <p className="form-error" role="alert">{current.error}</p>}
    {current.error && !current.data ? <p className="empty-state">아직 확인된 순위가 없습니다. 다시 확인해 주세요.</p> : <RankingResults data={current.data} finished={game?.status === 'FINISHED'} />}
    <button type="button" className="secondary-button" onClick={() => setRetry(value => value + 1)}>순위 다시 확인</button>
  </Panel>
}

export function RankingResults({ data, finished }) {
  if (!data) return <p className="empty-state">순위를 불러오고 있습니다.</p>
  const r = data.ranking
  const awaitingFinal = (finished || data.gameStatus === 'FINISHED') && !r.final
  return <div className="ranking-results">
    <p>{r.final ? '게임이 종료되었습니다. 종료 시점에 확정된 순위와 자산입니다.' : awaitingFinal ? '최종 결과를 확정하고 있습니다. 아래는 확정 전 순위입니다.' : '현재 총자산 기준 순위입니다. 거래와 주가 변화에 따라 갱신됩니다.'}</p>
    <p className="trading-help">참가자 {r.totalParticipants}명 · 계산 시각 <time dateTime={r.calculatedAt}>{new Date(r.calculatedAt).toLocaleString('ko-KR')}</time></p>
    <h3>TOP 3</h3>
    <p className="trading-help">동점자는 같은 순위로 표시합니다. 공동 3위까지 모두 포함합니다.</p>
    <p className="trading-help">다른 참가자의 이름은 공개하지 않습니다. 본인 행은 ‘나’로 표시합니다.</p>
    <AnonymousRankingList people={r.top3} label="상위 순위" />
    <details className="ranking-all"><summary>전체 순위 보기 ({r.totalParticipants}명)</summary><AnonymousRankingList people={r.rankings} label="전체 순위" /></details>
    <section aria-label="내 순위" className="ranking-mine">
      <h3>{r.final ? '나의 최종 결과' : '내 순위'}</h3>
      {r.me ? <><p className="ranking-name"><strong>{r.me.nickname}</strong> · <strong>{r.me.rank}위</strong> / {r.totalParticipants}명</p><dl><div><dt>총자산</dt><dd>{money(r.me.totalAssets)}</dd></div><div><dt>보유 현금</dt><dd>{money(r.me.cash)}</dd></div><div><dt>주식 평가액</dt><dd>{money(r.me.stockValue)}</dd></div></dl></> : <p>이 계정은 {r.final ? '확정된 최종' : '현재'} 순위에 포함되어 있지 않습니다.</p>}
    </section>
  </div>
}

export function AnonymousRankingList({ people, label }) {
  if (!people.length) return <p className="empty-state">아직 순위에 등록된 참가자가 없습니다.</p>
  return <ol className="ranking-list" aria-label={label}>{people.map((person, index) =>
    <li key={index} className={person.isMe ? 'ranking-self' : undefined}>
      <strong className="ranking-place">{person.rank}위</strong>
      <span className="ranking-name">{person.isMe ? <strong>나</strong> : null}</span>
      <strong>{money(person.totalAssets)}</strong>
    </li>
  )}</ol>
}
