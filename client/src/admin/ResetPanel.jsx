import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
export function canConfirmReset({ status, canControl, pending, acknowledged, confirmation }) {
  return status === 'FINISHED' && canControl && !pending && acknowledged && confirmation === '초기화'
}
export default function ResetPanel({ game, canControl, pending, control, refresh, onBusy, onReset }) {
  const [stage, setStage] = useState('idle')
  const [acknowledged, setAcknowledged] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const locked = useRef(false)
  useEffect(() => {
    if (stage === 'done' && game?.status !== 'WAITING') { setStage('idle'); setMessage('') }
    if (game?.status !== 'FINISHED' && stage === 'confirm') { setStage('idle'); setConfirmation(''); setAcknowledged(false) }
  }, [game?.status, stage])
  const complete = () => { setStage('done'); setMessage('초기화가 완료되어 대기 상태로 돌아왔습니다. 참가자는 새로 가입해야 합니다. 참가 준비 후 새 게임을 시작하세요.'); onReset() }
  const reset = async () => {
    if (locked.current || !canConfirmReset({ status: game?.status, canControl, pending, acknowledged, confirmation })) return
    locked.current = true; onBusy(true); setStage('working'); setMessage('')
    try {
      const success = await control('reset')
      if (success) { complete(); onBusy(false) }
      else { setStage('unknown'); setMessage('초기화 요청의 결과를 확인하지 못했습니다. 자동으로 다시 전송하지 않습니다. 서버 상태를 먼저 확인하세요.') }
    } finally { locked.current = false }
  }
  const reconcile = async () => {
    if (locked.current) return
    locked.current = true; setStage('checking')
    try {
      const next = await refresh()
      if (next?.game?.status === 'WAITING') { complete(); onBusy(false) }
      else if (next?.game?.status === 'FINISHED') { setStage('idle'); setMessage('서버는 아직 종료 상태입니다. 초기화를 다시 진행하려면 삭제 범위를 다시 확인하세요.'); onBusy(false) }
      else if (next?.game) { setStage('idle'); setMessage('게임 상태가 변경되었습니다. 최신 상태를 확인하세요.'); onBusy(false) }
      else setStage('unknown')
    } finally { locked.current = false }
  }
  return <Panel title="게임 초기화 · 새 게임">
    <p>종료된 게임을 초기화하면 기존 참가자·세션·지갑·보유 주식·주문·거래·순위·사건 배정이 삭제됩니다. 삭제한 기록은 되돌릴 수 없습니다.</p>
    <p>종목 설정과 사건 원본은 유지하며, 현재 주가는 초기 가격으로 돌아갑니다. 초기화 후 참가자는 다시 가입해야 합니다.</p>
    {message && <p role="status">{message}</p>}
    {stage === 'working' || stage === 'checking' ? <p role="status">서버에서 결과를 확인하고 있습니다...</p> : stage === 'unknown' ? <button className="secondary-button" type="button" onClick={reconcile}>초기화 결과 확인</button> : stage === 'confirm' ? <section className="reset-confirmation" aria-label="초기화 최종 확인">
      <h3>기록 삭제를 최종 확인하세요</h3>
      <label className="reset-ack"><input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />참가자와 거래 기록이 삭제됨을 확인했습니다.</label>
      <label htmlFor="reset-confirm-text">계속하려면 ‘초기화’를 입력하세요</label>
      <input id="reset-confirm-text" autoComplete="off" value={confirmation} onChange={e => setConfirmation(e.target.value)} />
      <div className="control-grid"><button className="secondary-button" type="button" onClick={() => setStage('idle')}>취소</button><button className="danger-button" type="button" disabled={!canConfirmReset({ status: game?.status, canControl, pending, acknowledged, confirmation })} onClick={reset}>기록 삭제 및 초기화 확정</button></div>
    </section> : <>
      <button className="danger-button" type="button" disabled={game?.status !== 'FINISHED' || !canControl || pending} onClick={() => { setConfirmation(''); setAcknowledged(false); setStage('confirm'); setMessage('') }}>게임 초기화 검토</button>
      {game?.status !== 'FINISHED' && <p className="trading-help">게임이 종료된 상태에서만 초기화할 수 있습니다.</p>}
      {stage === 'done' && game?.status === 'WAITING' && <button className="primary-button" type="button" disabled={!canControl || pending} onClick={() => control('start')}>새 게임 시작</button>}
    </>}
  </Panel>
}
