import { useDraftGuard } from '../navigation/NavigationGuard'
import ScheduleEditor from './ScheduleEditor'
import { validateConstraints } from './schedule'
import { companyRequest } from '../companies/api'
import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
import ActionDialog, { ConfirmDialog, requestDialogClose } from '../components/ActionDialog'
import { eventRequest, eventInput, eventError } from './api'
const blank = () => ({ title: '', news: '', result: '', effects: [{ companyId: '', changeRate: '0' }] })
export default function EventManager({ password, game, stale, onBusy }) {
  const [events, setEvents] = useState(null)
  const [companies, setCompanies] = useState([])
  const [schedule, setSchedule] = useState([])
  const [constraints, setConstraints] = useState(null)
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const draftDirty = JSON.stringify(form) !== JSON.stringify(blank())
  useDraftGuard(editorOpen && draftDirty)
  const locked = useRef(false)
  const generation = useRef(0)
  useEffect(() => { ++generation.current; setEvents(null); setSchedule([]); setForm(blank()); setEditing(null); setEditorOpen(false); setScheduleOpen(false); setDeleting(null); setMessage(''); setError(''); return () => { ++generation.current } }, [password])
  const canEdit = game?.status === 'WAITING' && !stale && Boolean(password) && events !== null && !busy && !uncertain
  const run = async (work) => {
    if (locked.current) return
    locked.current = true; setBusy(true); onBusy(true); setError(''); setMessage('')
    const version = generation.current
    try { return await work(() => version === generation.current) } catch (e) { if (version === generation.current) { setError(eventError(e)); setUncertain(true) } }
    finally { locked.current = false; setBusy(false); onBusy(false) }
  }
  const load = () => run(async current => {
    const [list, assigned, allCompanies] = await Promise.all([
      eventRequest('/admin', { password }), eventRequest('/admin/schedule', { password }), companyRequest('', { password }),
    ])
    const limits = validateConstraints(assigned.constraints)
    if (current()) { setEvents(list.events); setSchedule(assigned.schedule); setConstraints(limits); setCompanies(allCompanies); setUncertain(false); setDeleting(null) }

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
        setSchedule(list => list.map(item => item.eventId === data.event.eventId ? { ...item, title: data.event.title, news: data.event.news, result: data.event.result } : item))
        setForm(blank()); setEditing(null); setEditorOpen(false); setUncertain(false); setMessage('사건을 저장했습니다.')
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
    <p className="trading-help">대기 중 사건을 등록하고 아래에서 월별로 배정하세요. 한 달에 여러 사건 또는 사건 없는 달을 구성할 수 있습니다. 배정을 저장하지 않으면 시작 시 기존 방식으로 월별 마감 사건 1개를 무작위 배정합니다.</p>
    <button type="button" className="secondary-button" disabled={!password || busy || stale} onClick={load}>사건 목록 조회</button>
    {error && <p className="form-error" role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {uncertain && <p className="trading-help">사건·배정의 최신 상태를 확인하려면 목록을 먼저 조회해 주세요. 요청을 자동 재전송하지 않으며 입력 초안은 유지됩니다.</p>}
    {events && <p>등록 사건 {events.length}개</p>}
    {game?.status !== 'WAITING' && <p>게임이 시작되어 사건은 조회만 가능합니다.</p>}
    {events && <ul className="event-list">{events.map(item => <li key={item.eventId}>
      <h3>{item.title}</h3><p>{item.news}</p><details><summary>결과와 변동률</summary><p>{item.result}</p><p>{item.effects.map(effect => `${effect.companyId}: ${effect.changeRate > 0 ? '+' : ''}${effect.changeRate}%`).join(' / ')}</p></details>
      <div className="event-actions"><button type="button" className="secondary-button" disabled={!canEdit} onClick={() => { setEditing(item.eventId); setForm({ title: item.title, news: item.news, result: item.result, effects: item.effects.map(effect => ({ ...effect, changeRate: String(effect.changeRate) })) }); setEditorOpen(true); setDeleting(null); setMessage('') }}>수정</button><button type="button" className="secondary-button" disabled={!canEdit} onClick={() => setDeleting(item)}>삭제</button></div>
    </li>)}</ul>}
    {events && <div className="list-toolbar"><p>등록 {events.length}개 · 배정 {schedule.length}개</p><div className="event-actions"><button type="button" className="secondary-button" onClick={() => setScheduleOpen(true)}>월별 배정 관리</button><button type="button" className="primary-button" disabled={!canEdit} onClick={() => { setEditing(null); setForm(blank()); setEditorOpen(true) }}>새 사건 등록</button></div></div>}
    <ConfirmDialog open={Boolean(deleting)} title="사건 삭제" onCancel={() => setDeleting(null)} onConfirm={remove} busy={busy} confirmDisabled={!canEdit} confirmLabel="삭제 확정" danger><p>“{deleting?.title}” 사건을 삭제할까요? 배정에 사용 중인 사건은 서버가 삭제를 막습니다.</p></ConfirmDialog>
    <ActionDialog open={editorOpen} title={editing ? '사건 수정' : '새 사건 등록'} eyebrow="MARKET EVENT" onClose={() => { setEditorOpen(false); setEditing(null); setForm(blank()) }} busy={busy} dirty={draftDirty} width="large">
    {events && <form className="event-form" onSubmit={save}>
      <fieldset disabled={!canEdit}>
        <label htmlFor="event-title">사건 제목</label><input id="event-title" maxLength={100} value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
        <label htmlFor="event-news">사전 뉴스 (참가자에게 공개)</label><textarea id="event-news" maxLength={2000} rows={4} value={form.news} onChange={e => setForm({ ...form, news: e.target.value })} required />
        <label htmlFor="event-result">사건 결과 (해당 사건 적용 후 공개)</label><textarea id="event-result" maxLength={2000} rows={4} value={form.result} onChange={e => setForm({ ...form, result: e.target.value })} required />
        {form.effects.map((effect, index) => <div className="event-effect" key={index}>
          <label>영향 기업 {index + 1}<select value={effect.companyId} onChange={e => updateEffect(index, 'companyId', e.target.value)} required><option value="">기업 선택</option>{companies.map(company => <option key={company.companyId} value={company.companyId} disabled={!company.isActive}>{company.name}{!company.isActive ? ' (비활성)' : ''}</option>)}</select></label>
          <label>변동률 (%) {index + 1}<input type="text" inputMode="text" placeholder="예: -10 또는 20" value={effect.changeRate} onChange={e => updateEffect(index, 'changeRate', e.target.value)} required /></label>
          <button type="button" className="secondary-button" disabled={form.effects.length === 1} onClick={() => setForm({ ...form, effects: form.effects.filter((_, i) => i !== index) })}>영향 기업 {index + 1} 제거</button>
        </div>)}
        <p className="trading-help">기업별 -99~1000 사이의 정수로 입력합니다. 감소는 음수(-)로 입력하세요.</p>
        <button type="button" className="secondary-button" disabled={form.effects.length >= Math.min(50, companies.filter(c => c.isActive).length)} onClick={() => setForm({ ...form, effects: [...form.effects, { companyId: '', changeRate: '0' }] })}>영향 기업 추가</button>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={requestDialogClose}>취소</button><button type="submit" className="primary-button">{editing ? '수정 저장' : '사건 등록'}</button></div>
      </fieldset>
    </form>}
    </ActionDialog>
    <ActionDialog open={scheduleOpen} title="월별 사건 배정" eyebrow="EVENT SCHEDULE" onClose={() => setScheduleOpen(false)} busy={busy} width="large">
    {events && constraints && <ScheduleEditor events={events} companies={companies} schedule={schedule} constraints={constraints} canEdit={canEdit} onWrite={(mode, body) => {
      if (!canEdit) return
      return run(async current => {
        setUncertain(true)
        const data = await eventRequest(mode === 'manual' ? '/admin/schedule' : '/admin/schedule/randomize', { password, method: mode === 'manual' ? 'PUT' : 'POST', body })
        if (current()) { setSchedule(data.schedule); setUncertain(false); setMessage('월별 배정을 저장했습니다.'); return data.schedule }
      })
    }} />}
    </ActionDialog>

  </Panel>
}
