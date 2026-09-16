import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
import { eventRequest, eventInput, eventError } from './api'
const blank = () => ({ title: '', news: '', result: '', effects: [{ companyId: '', changeRate: '0' }] })
export default function EventManager({ password, game, stale, onBusy }) {
  const [events, setEvents] = useState(null)
  const [companies, setCompanies] = useState([])
  const [schedule, setSchedule] = useState([])
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const locked = useRef(false)
  const generation = useRef(0)
  useEffect(() => { ++generation.current; setEvents(null); setSchedule([]); setForm(blank()); setEditing(null); setDeleting(null); setMessage(''); setError(''); return () => { ++generation.current } }, [password])
  const canEdit = game?.status === 'WAITING' && !stale && Boolean(password) && events !== null && !busy && !uncertain
  const run = async (work) => {
    if (locked.current) return
    locked.current = true; setBusy(true); onBusy(true); setError(''); setMessage('')
    const version = generation.current
    try { await work(() => version === generation.current) } catch (e) { if (version === generation.current) setError(eventError(e)) }
    finally { locked.current = false; setBusy(false); onBusy(false) }
  }
  const load = () => run(async current => {
    const base = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
    const [list, assigned, marketResponse] = await Promise.all([
      eventRequest('/admin', { password }), eventRequest('/admin/schedule', { password }),
      fetch(`${base}/api/trading/market`, { credentials: 'include', signal: AbortSignal.timeout(8000) }),
    ])
    if (!marketResponse.ok) throw new Error('DATABASE_UNAVAILABLE')
    const market = await marketResponse.json()
    if (current()) { setEvents(list.events); setSchedule(assigned.schedule); setCompanies(market.companies); setUncertain(false) }
  })
  const save = (e) => {
    e.preventDefault()
    if (!canEdit) return
    let body
    try { body = eventInput(form) } catch (failure) { setError(eventError(failure)); return }
    run(async current => {
      // If a write response is lost, force an explicit list read before another write.
      setUncertain(true)
      const data = await eventRequest(editing ? `/admin/${editing}` : '/admin', { password, method: editing ? 'PUT' : 'POST', body })
      if (current()) {
        setEvents(list => editing ? list.map(item => item.eventId === editing ? data.event : item) : [...list, data.event])
        setForm(blank()); setEditing(null); setUncertain(false); setMessage('사건을 저장했습니다.')
      }
    })
  }
  const remove = () => {
    if (!canEdit || !deleting) return
    run(async current => {
      setUncertain(true)
      await eventRequest(`/admin/${deleting.eventId}`, { password, method: 'DELETE' })
      if (current()) { setEvents(list => list.filter(item => item.eventId !== deleting.eventId)); setDeleting(null); setUncertain(false); setMessage('사건을 삭제했습니다.') }
    })
  }
  const updateEffect = (index, field, value) => setForm(f => ({ ...f, effects: f.effects.map((item, i) => i === index ? { ...item, [field]: value } : item) }))
  return <Panel title="사건 관리">
    <p className="trading-help">게임 시작 전 사건을 등록하세요. {game?.totalRounds || '전체'}개월 게임에는 서로 다른 사건이 그 수만큼 필요합니다. 시작하면 무작위로 배정됩니다.</p>
    <button type="button" className="secondary-button" disabled={!password || busy} onClick={load}>사건 목록 조회</button>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {uncertain && <p className="trading-help">저장·삭제 결과를 확인하려면 사건 목록을 먼저 조회해 주세요. 목록에 반영됐다면 다시 등록하지 마세요.</p>}
    {events && <p>등록 {events.length}개 / 필요 {game?.totalRounds ?? '—'}개</p>}
    {game?.status !== 'WAITING' && <p>게임이 시작되어 사건은 조회만 가능합니다.</p>}
    {events && <ul className="event-list">{events.map(item => <li key={item.eventId}>
      <h3>{item.title}</h3><p>{item.news}</p><details><summary>결과와 변동률</summary><p>{item.result}</p><p>{item.effects.map(effect => `${effect.companyId}: ${effect.changeRate > 0 ? '+' : ''}${effect.changeRate}%`).join(' / ')}</p></details>
      <div className="event-actions"><button type="button" className="secondary-button" disabled={!canEdit} onClick={() => { setEditing(item.eventId); setForm({ title: item.title, news: item.news, result: item.result, effects: item.effects.map(effect => ({ ...effect, changeRate: String(effect.changeRate) })) }); setDeleting(null); setMessage('선택한 사건을 아래 양식에서 수정하세요.') }}>수정</button><button type="button" className="secondary-button" disabled={!canEdit} onClick={() => setDeleting(item)}>삭제</button></div>
    </li>)}</ul>}
    {deleting && <section className="end-confirmation" aria-label="사건 삭제 확인"><p>“{deleting.title}” 사건을 삭제할까요?</p><button type="button" className="secondary-button" onClick={() => setDeleting(null)} disabled={busy}>삭제 취소</button><button type="button" className="primary-button" disabled={!canEdit} onClick={remove}>삭제 확정</button></section>}
    {events && <form className="event-form" onSubmit={save}>
      <h3>{editing ? '사건 수정' : '새 사건 등록'}</h3><fieldset disabled={!canEdit}>
        <label htmlFor="event-title">사건 제목</label><input id="event-title" maxLength={100} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
        <label htmlFor="event-news">사전 뉴스 (참가자에게 공개)</label><textarea id="event-news" maxLength={2000} rows={4} value={form.news} onChange={e => setForm({ ...form, news: e.target.value })} required />
        <label htmlFor="event-result">사건 결과 (거래 마감 후 공개)</label><textarea id="event-result" maxLength={2000} rows={4} value={form.result} onChange={e => setForm({ ...form, result: e.target.value })} required />
        {form.effects.map((effect, index) => <div className="event-effect" key={index}>
          <label>영향 기업 {index + 1}<select value={effect.companyId} onChange={e => updateEffect(index, 'companyId', e.target.value)} required><option value="">기업 선택</option>{companies.map(company => <option key={company.companyId} value={company.companyId}>{company.name}</option>)}</select></label>
          <label>변동률 (%) {index + 1}<input type="text" inputMode="text" placeholder="예: -10 또는 20" value={effect.changeRate} onChange={e => updateEffect(index, 'changeRate', e.target.value)} required /></label>
          <button type="button" className="secondary-button" disabled={form.effects.length === 1} onClick={() => setForm({ ...form, effects: form.effects.filter((_, i) => i !== index) })}>영향 기업 {index + 1} 제거</button>
        </div>)}
        <p className="trading-help">기업별 -99~1000 사이의 정수로 입력합니다. 감소는 음수(-)로 입력하세요.</p>
        <button type="button" className="secondary-button" disabled={form.effects.length >= companies.length} onClick={() => setForm({ ...form, effects: [...form.effects, { companyId: '', changeRate: '0' }] })}>영향 기업 추가</button>
        <button type="submit" className="primary-button">{editing ? '수정 저장' : '사건 등록'}</button>
        {editing && <button type="button" className="secondary-button" onClick={() => { setEditing(null); setForm(blank()) }}>수정 취소</button>}
      </fieldset>
    </form>}
    {schedule.length > 0 && <details><summary>관리자 전용 월별 배정표</summary><ol>{schedule.map(item => <li key={item.round}>{item.round}월 · {item.title} · {item.appliedAt ? '적용 완료' : '예정'}</li>)}</ol></details>}
  </Panel>
}
