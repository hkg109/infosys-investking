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
  return <Panel title="이번 달 뉴스 · 사건 결과">
    {error && <p role="alert" className="form-error">{error}</p>}
    {!events.length ? <p className="empty-state">{game?.status === 'WAITING' ? '게임 시작 후 이번 달 뉴스가 공개됩니다.' : data && data.game?.currentRound === game?.currentRound ? '이번 달에 배정된 사건이 없습니다.' : '이번 달 뉴스를 확인하고 있습니다.'}</p> : events.map(event => <EventArticle key={event.gameEventId || event.eventId} event={event} />)}
    <button type="button" className="secondary-button" onClick={() => setRetry(n => n + 1)}>뉴스 다시 확인</button>
  </Panel>
}

export function EventArticle({ event }) {
  return <article className="event-news">
      <p className="eyebrow">{event.round}월 뉴스 · {event.triggerPhase === 'INTRADAY' ? '장중 사건' : '마감 후 사건'}</p><h3>{event.title}</h3><p>{event.news}</p>
      {event.applied ? <section aria-label="공개된 사건 결과"><h3>사건 결과</h3><p>{event.result}</p><ul>{event.changes.map(change => <li key={change.companyId}><strong>{change.name}</strong><span>{money(change.previousPrice)} → {money(change.newPrice)}</span><span>사건 변동률 {change.changeRate > 0 ? '+' : ''}{change.changeRate}%</span></li>)}</ul></section> : <p className="trading-help">이 사건이 발생하고 주가에 반영되면 결과가 공개됩니다.</p>}
    </article>
}

export function currentEvents(data, round) {
  const events = Array.isArray(data?.events) ? data.events : data?.event ? [data.event] : []
  return events.filter(event => event.round === round)
}
