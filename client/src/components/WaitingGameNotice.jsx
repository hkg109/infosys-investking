export default function WaitingGameNotice({ waiting }) {
  if (!waiting) return null
  return <aside className="waiting-game-notice" role="status" aria-live="polite">
    <span className="waiting-game-notice__pulse" aria-hidden="true" />
    <div><strong>대기 중</strong><p>게임 시작을 기다리고 있습니다.</p></div>
  </aside>
}
