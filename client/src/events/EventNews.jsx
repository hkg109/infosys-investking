import { useEffect, useState } from 'react'
import { eventRequest } from './api'
import Panel from '../components/Panel'
import { money } from '../game/model'

export default function EventNews({ game, revision }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    let active = true
    eventRequest('/current').then(next => {
      if (active) { setData(next); setError('') }
    }).catch(() => { if (active) setError('뉴스를 불러오지 못했습니다. 다시 확인해 주세요.') })
    return () => { active = false }
  }, [revision, retry])
  const events = currentEvents(data, game?.currentRound)
  return <Panel title="시장 뉴스">
    <header className="newsroom-header">
      <div>
        <p className="newsroom-header__brand">INVESTKING MARKET</p>
        <p>{Number.isInteger(game?.currentRound) && game.currentRound > 0 ? `${game.currentRound}월 시장 브리핑` : '실시간 시장 브리핑'}</p>
      </div>
      <span>LIVE NEWS</span>
    </header>
    {error && <p role="alert" className="form-error">{error}</p>}
    {!events.length ? <p className="empty-state">{game?.status === 'WAITING' ? '게임 시작 후 이번 달 뉴스가 공개됩니다.' : data && data.game?.currentRound === game?.currentRound ? '이번 달에 배정된 사건이 없습니다.' : '이번 달 뉴스를 확인하고 있습니다.'}</p> : events.map(event => <EventArticle key={event.gameEventId || event.eventId} event={event} />)}
    <button type="button" className="secondary-button newsroom-refresh" onClick={() => setRetry(n => n + 1)}>뉴스 다시 확인</button>
  </Panel>
}

export function EventArticle({ event }) {
  const intraday = event.triggerPhase === 'INTRADAY'
  const publication = publicationTime(event)
  const changes = Array.isArray(event.changes) ? event.changes : []
  return <article className={`event-news market-article${intraday ? ' market-article--breaking' : ''}`}>
      <div className="market-article__meta">
        <span className={intraday ? 'news-badge news-badge--breaking' : 'news-badge'}>{intraday ? '장중 속보' : '마감 뉴스'}</span>
        <span>{event.round}월</span>
        <time dateTime={publication.dateTime}>{publication.label}</time>
        <span>{event.applied ? '결과 공개' : '결과 대기'}</span>
      </div>
      <h3>{event.title}</h3>
      <p className="market-article__lead">{event.news}</p>
      {event.applied ? <section className="market-result" aria-label="공개된 사건 결과">
        <p className="market-result__label">MARKET IMPACT</p>
        <h4>사건 결과</h4>
        <p>{event.result}</p>
        {changes.length > 0 && <ul className="market-impact-list">{changes.map(change => {
          const direction = change.changeRate > 0 ? 'up' : change.changeRate < 0 ? 'down' : 'flat'
          const symbol = direction === 'up' ? '▲' : direction === 'down' ? '▼' : '—'
          return <li key={change.companyId} className={`market-impact market-impact--${direction}`}>
            <div><strong>{change.name}</strong><span>{money(change.previousPrice)} → {money(change.newPrice)}</span></div>
            <strong>{symbol} {change.changeRate > 0 ? '+' : ''}{change.changeRate}%</strong>
          </li>
        })}</ul>}
      </section> : <p className="market-article__pending">사건 발생 후 주가에 반영되면 결과와 영향 종목이 공개됩니다.</p>}
    </article>
}

export function publicationTime(event) {
  const value = event.appliedAt || event.scheduledAt
  if (!value) return { dateTime: undefined, label: event.applied ? '공개 시각 미정' : '공개 예정' }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { dateTime: undefined, label: event.applied ? '공개 시각 미정' : '공개 예정' }
  const time = date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  return { dateTime: date.toISOString(), label: `${event.applied ? '공개' : '예정'} ${time}` }
}

export function currentEvents(data, round) {
  const events = Array.isArray(data?.events) ? data.events : data?.event ? [data.event] : []
  return events.filter(event => event.round === round)
}
