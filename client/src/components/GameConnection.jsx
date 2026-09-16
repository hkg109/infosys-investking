export default function GameConnection({ loading, error, connected, refresh, pending }) {
  const healthy = !loading && !error && connected
  return <div className={healthy ? 'connection-status' : 'dashboard-notice'} role="status" aria-live="polite">
    <span>{loading ? '게임 정보를 불러오고 있습니다.' : error || (connected ? '실시간 연결됨' : '실시간 연결을 복구하고 있습니다. 게임 정보는 주기적으로 확인합니다.')}</span>
    {!loading && !healthy && <button className="secondary-button" type="button" disabled={pending} onClick={refresh}>연결 다시 확인</button>}
  </div>
}
