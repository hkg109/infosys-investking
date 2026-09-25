// Development-only harness. Simulates the draft contract; NOT backend verification.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import IntelligencePanel from '../src/intelligence/IntelligencePanel'
import IntelligenceManager from '../src/intelligence/IntelligenceManager'
import '../src/styles/global.css'
const seed = { clues: [{ clueId: 'clue-1', title: '반도체 수요 단서', summary: '다음 달 산업 흐름에 관한 정보', content: '비공개 본문: 반도체 수요 증가 가능성\n확정 수익을 의미하지 않습니다.', price: 10, availableRound: 1, isActive: true }], accounts: { one: { cash: 40, purchases: [] }, two: { cash: 0, purchases: [] } } }
let database = JSON.parse(sessionStorage.getItem('stage9-fixture') || 'null') || structuredClone(seed)
let userId = 'one', status = 'RUNNING', loseResponse = false, expired = false
const persist = () => sessionStorage.setItem('stage9-fixture', JSON.stringify(database))
const store = () => ({ ...database.accounts[userId], items: database.clues.filter(c => c.isActive).map(({ content, isActive, ...c }) => ({ ...c, canPurchase: status === 'RUNNING' })) })
window.fetch = async (url, options = {}) => {
  const path = String(url).replace('/api/intelligence', '')
  if (!String(url).startsWith('/api/intelligence')) throw new Error('Fixture only')
  const response = (body, code = 200) => new Response(code === 204 ? null : JSON.stringify(body), { status: code, headers: { 'Content-Type': 'application/json' } })
  if (expired && !path.startsWith('/admin')) return response({ error: 'AUTH_REQUIRED' }, 401)
  if (path === '/me') return response(store())
  if (path === '/purchases') {
    const body = JSON.parse(options.body), account = database.accounts[userId], clue = database.clues.find(c => c.clueId === body.clueId)
    if (!account.purchases.some(p => p.clueId === body.clueId)) {
      if (status !== 'RUNNING') return response({ error: 'PURCHASE_CLOSED' }, 409)
      if (account.cash < clue.price) return response({ error: 'INSUFFICIENT_CASH' }, 409)
      account.cash -= clue.price; account.purchases.push({ ...clue, paidCash: clue.price, purchasedAt: new Date().toISOString() }); persist()
    }
    if (loseResponse) { loseResponse = false; throw new Error('Simulated response loss after commit') }
    return response(store())
  }
  if (path === '/admin' && (!options.method || options.method === 'GET')) return response({ clues: database.clues })
  if (status !== 'WAITING') return response({ error: 'CLUE_MANAGEMENT_CLOSED' }, 409)
  if (options.method === 'DELETE') { database.clues.find(c => path.endsWith(c.clueId)).isActive = false; persist(); return response(null, 204) }
  const clue = { ...JSON.parse(options.body), clueId: options.method === 'POST' ? crypto.randomUUID() : decodeURIComponent(path.split('/').pop()) }
  if (options.method === 'POST') database.clues.push(clue)
  else database.clues = database.clues.map(c => c.clueId === clue.clueId ? clue : c)
  persist(); return response({ clue }, options.method === 'POST' ? 201 : 200)
}
function Preview() {
  const [version, setVersion] = useState(0), [who, setWho] = useState('one'), [gameStatus, setGameStatus] = useState('RUNNING'), [width, setWidth] = useState('390'), [admin, setAdmin] = useState(false)
  const refresh = () => setVersion(n => n + 1)
  return <main style={{ padding: 12 }}><h1>9단계 모의 API UI 검증</h1><p>실제 구매·DB·권한 검증이 아닌 프론트엔드 테스트 화면입니다.</p>
    <div className="event-actions"><label>화면 폭<select value={width} onChange={e => setWidth(e.target.value)}>{['320','390','412','768','1100'].map(w => <option key={w}>{w}</option>)}</select></label>
    <label>계정<select value={who} onChange={e => { userId = e.target.value; setWho(userId); expired = false; refresh() }}><option value="one">계정 1 (40P)</option><option value="two">계정 2 (0P)</option></select></label>
    <label>게임 상태<select value={gameStatus} onChange={e => { status = e.target.value; setGameStatus(status); refresh() }}>{['WAITING','RUNNING','PAUSED','FINISHED'].map(s => <option key={s}>{s}</option>)}</select></label>
    <label><input type="checkbox" checked={admin} onChange={e => setAdmin(e.target.checked)}/>관리자 화면</label>
    <button onClick={() => { loseResponse = true }}>다음 구매 응답 유실</button><button onClick={() => { expired = true; refresh() }}>세션 만료</button><button onClick={() => { database = structuredClone(seed); expired = false; persist(); refresh() }}>모의 데이터 초기화</button></div>
    <div id="preview" style={{ width: Number(width), maxWidth: '100%', margin: '20px auto' }}>{admin ? <IntelligenceManager key={`admin-${who}`} password="fixture" game={{ status: gameStatus, totalRounds: 12 }} stale={false} onBusy={() => {}}/> : <IntelligencePanel key={who} userId={who} game={{ status: gameStatus }} revision={version} stale={false} onPurchased={refresh}/>}</div>
  </main>
}
createRoot(document.getElementById('root')).render(<Preview/> )
