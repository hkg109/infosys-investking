import Panel from './Panel'
import StatCard from './StatCard'

import { formatTime, statusLabels } from '../game/model'

const controls = [
  { action: 'start', label: '게임 시작', states: ['WAITING'] },
  { action: 'pause', label: '일시정지', states: ['RUNNING'] },
  { action: 'resume', label: '재개', states: ['PAUSED'] },
  { action: 'end', label: '게임 종료', states: ['RUNNING', 'PAUSED'] },
]

// View props are local UI inputs, not an agreed server payload.
// The future adapter must supply authenticated, server-confirmed values.
export default function AdminDashboard({ game = null, onControl, canControl = false, pending = false }) {
  const status = game?.status
  const ready = Boolean(statusLabels[status])
  const hasRound = Number.isInteger(game?.currentRound) && game.currentRound > 0
  const hasParticipants = Number.isInteger(game?.connectedParticipants) && game.connectedParticipants >= 0

  return (
    <>
      {!ready && <p className="dashboard-notice" role="status">게임 정보를 아직 확인하지 못했습니다. 정보를 확인한 후 게임을 제어할 수 있습니다.</p>}
      <div className="stats-grid">
        <StatCard label="현재 게임 상태" value={statusLabels[status] || '확인 전'} tone="accent" />
        <StatCard label="현재 월" value={hasRound ? `${game.currentRound}월` : '—'} />
        <StatCard label="남은 시간" value={formatTime(game?.remainingSeconds)} />
        <StatCard label="접속 참가자 수" value={hasParticipants ? `${game.connectedParticipants}명` : '—'} />
        <StatCard label="거래 상태" value={!ready ? '확인 전' : status !== 'RUNNING' ? '중지' : typeof game.tradingEnabled === 'boolean' ? (game.tradingEnabled ? '거래 가능' : '마감') : '확인 전'} />
      </div>
      <Panel title="게임 제어">
        <p id="game-control-help" className="control-help">
          {pending ? '요청을 처리하고 있습니다.' : !canControl || !onControl ? '게임 제어 권한을 확인한 후 사용할 수 있습니다.' : '현재 게임 상태에서 가능한 작업만 선택할 수 있습니다.'}
        </p>
        <div className="control-grid" aria-busy={pending}>
          {controls.map(({ action, label, states }) => (
            <button
              className="secondary-button"
              key={action}
              type="button"
              disabled={!ready || !canControl || !onControl || pending || !states.includes(status)}
              aria-describedby="game-control-help"
              onClick={() => onControl(action)}
            >{label}</button>
          ))}
        </div>
      </Panel>
    </>
  )
}
