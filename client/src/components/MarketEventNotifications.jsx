export default function MarketEventNotifications({ notices = [], onOpen, onDismiss }) {
  if (!notices.length) return null
  return <section className="market-notifications" aria-label="장중 사건 알림" aria-live="polite">
    {notices.map(notice => <article className="market-notification" key={notice.gameEventId}>
      <button type="button" className="market-notification__open" onClick={() => onOpen?.(notice)}>
        <span className="sr-only">장중 사건 기사 열기: </span>{notice.title}
      </button>
      <button type="button" className="market-notification__close" aria-label={`${notice.title} 알림 닫기`} onClick={() => onDismiss?.(notice.gameEventId)}>×</button>
    </article>)}
  </section>
}
