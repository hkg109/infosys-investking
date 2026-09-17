// Development-only fixture. No HTTP requests or database mutations.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import ResetPanel from '../src/admin/ResetPanel'
import '../src/styles/global.css'
function Harness() {
  const [status, setStatus] = useState('FINISHED')
  const [lost, setLost] = useState(false)
  const [calls, setCalls] = useState(0)
  const [busy, setBusy] = useState(false)
  return <main className="page-container"><h1>초기화 UI 모의 검증</h1><p>실제 서버·DB에 연결하지 않는 테스트입니다.</p><label><input type="checkbox" checked={lost} onChange={e => setLost(e.target.checked)} />응답 유실 재현</label><p>요청 횟수: {calls} · 상태: {status} · 제어 잠금: {String(busy)}</p><ResetPanel game={{status}} canControl pending={false} onBusy={setBusy} onReset={() => {}} refresh={async () => ({ game: { status } })} control={async action => { setCalls(n => n + 1); setStatus(action === 'reset' ? 'WAITING' : 'RUNNING'); return !lost }} /></main>
}
createRoot(document.getElementById('root')).render(<Harness />)
