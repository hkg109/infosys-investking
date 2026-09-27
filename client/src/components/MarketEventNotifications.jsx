import { useEffect, useState } from 'react'
import { marketNoticeStatus } from '../game/marketNotice'

export default function MarketEventNotifications({ notices = [], serverOffsetMs = 0, onOpen, onDismiss }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => {
    const timers = notices.filter(notice => notice.state === 'CLOSED').map(notice => setTimeout(() => onDismiss?.(notice.gameEventId), Math.max(0, (notice.closedAt || now) + 8000 - (Date.now() + serverOffsetMs))))
    return () => timers.forEach(clearTimeout)
  }, [notices, onDismiss, serverOffsetMs])
  if (!notices.length) return null
  return <section className="market-notifications" aria-label="장중 사건 알림" aria-live="polite">
    {notices.map(notice => <article className="market-notification" data-state={notice.state} key={notice.gameEventId}>
      <button type="button" className="market-notification__open" onClick={() => onOpen?.(notice)}>
        <span className="sr-only">장중 사건 기사 열기: </span><strong>{notice.title}</strong><span>{marketNoticeStatus(notice, now + serverOffsetMs)}</span>
      </button>
      <button type="button" className="market-notification__close" aria-label={`${notice.title} 알림 닫기`} onClick={() => onDismiss?.(notice.gameEventId)}>×</button>
    </article>)}
  </section>
}
