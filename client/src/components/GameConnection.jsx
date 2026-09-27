import RefreshIconButton from './RefreshIconButton'

export default function GameConnection({ loading, error, connected, refresh, pending }) {
  const healthy = !loading && !error && connected
  return <div className={`header-connection${healthy ? ' header-connection--healthy' : ' header-connection--attention'}`} role="status" aria-live="polite">
    <span>{loading ? '게임 정보를 불러오고 있습니다.' : error || (connected ? '실시간 연결됨' : '실시간 연결 복구 중')}</span>
    {!loading && !healthy && <RefreshIconButton label="연결 업데이트" loading={pending} disabled={pending} onClick={refresh} />}
  </div>
}
