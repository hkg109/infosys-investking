import { useDraftGuard } from '../navigation/NavigationGuard'
import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
import ActionDialog, { ConfirmDialog, requestDialogClose } from '../components/ActionDialog'
import { DEFAULT_INTELLIGENCE_PRICE, clueInput, intelligenceError, intelligenceRequest } from './api'
import { eventRequest } from '../events/api'
const blank = () => ({ title: '', summary: '', content: '', price: String(DEFAULT_INTELLIGENCE_PRICE), availableRound: '1', isActive: true, eventId: '' })
export default function IntelligenceManager({ password, game, stale, onBusy }) {
  const [clues, setClues] = useState(null), [fresh, setFresh] = useState(false)
  const [events, setEvents] = useState([])
  const [form, setForm] = useState(blank), [editing, setEditing] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [busy, setBusy] = useState(false), [review, setReview] = useState(null)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const draftDirty = JSON.stringify(form) !== JSON.stringify(blank())
  useDraftGuard(editorOpen && draftDirty)
  const lock = useRef(false), generation = useRef(0)
  useEffect(() => {
    ++generation.current; setClues(null); setEvents([]); setFresh(false); setForm(blank()); setEditing(null); setEditorOpen(false); setReview(null)
    return () => { ++generation.current }
  }, [password])
  const editable = fresh && !busy && !stale && game?.status === 'WAITING'
  const run = async work => {
    if (lock.current) return
    lock.current = true; setBusy(true); onBusy(true); setError(''); setMessage('')
    const owner = generation.current
    try { await work(() => owner === generation.current) }
    catch (failure) { if (owner === generation.current) { setError(intelligenceError(failure)); setFresh(false); setReview(null) } }
    finally { lock.current = false; if (owner === generation.current) { setBusy(false); onBusy(false) } }
  }
  const load = () => run(async current => {
    const [data, eventData, assigned] = await Promise.all([
      intelligenceRequest('/admin', { password }), eventRequest('/admin', { password }), eventRequest('/admin/schedule', { password }),
    ])
    const byId = new Map(assigned.schedule.map(item => [item.eventId, item]))
    const choices = eventData.events.map(item => ({ ...item, schedule: byId.get(item.eventId) || null }))
    if (current()) { setClues(data.clues); setEvents(choices); setFresh(true); setReview(null); setMessage('최신 단서·사건 목록을 확인했습니다. 입력 초안은 유지됩니다.') }
  })
  const save = event => {
    event.preventDefault(); if (!editable) return
    let body
    try { body = clueInput(form) } catch (failure) { setError(intelligenceError(failure)); return }
    if (game?.totalRounds && body.availableRound > game.totalRounds) { setError(`공개 월은 게임의 마지막 월(${game.totalRounds}) 이내로 입력하세요.`); return }
    run(async current => {
      setFresh(false)
      const { clue } = await intelligenceRequest(editing ? `/admin/${encodeURIComponent(editing)}` : '/admin', { password, method: editing ? 'PUT' : 'POST', body })
      if (!current()) return
      setClues(previous => editing ? previous.map(item => item.clueId === editing ? clue : item) : [...previous, clue])
      setFresh(true); setForm(blank()); setEditing(null); setEditorOpen(false); setReview(null); setMessage('단서를 저장했습니다.')
    })
  }
  const deactivate = () => {
    if (!editable || !review) return
    run(async current => {
      setFresh(false)
      await intelligenceRequest(`/admin/${encodeURIComponent(review.clueId)}`, { method: 'DELETE', password })
      if (!current()) return
      setClues(previous => previous.map(item => item.clueId === review.clueId ? { ...item, isActive: false } : item))
      if (editing === review.clueId) { setEditing(null); setEditorOpen(false); setForm(blank()) }
      setFresh(true); setReview(null); setMessage('단서를 비활성화했습니다. 기존 구매 기록은 유지됩니다.')
    })
  }
  const change = event => setForm(previous => ({ ...previous, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  return <Panel title="시장정보 단서 관리">
    <p>게임 대기 중에 단서를 편집합니다. 제목·요약은 상점에 공개되며 본문은 구매한 참가자만 볼 수 있습니다.</p>
    <button type="button" className="secondary-button" disabled={busy || stale} onClick={load}>{busy ? '단서 처리 중...' : '단서 목록 조회'}</button>
    {error && <p role="alert" className="form-error">{error} 변경 요청은 자동 재전송하지 않습니다. 목록에서 반영 여부를 다시 확인하세요.</p>}
    {message && <p role="status">{message}</p>}
    {clues && !fresh && <p>마지막 확인 정보입니다. 재조회 후 편집할 수 있습니다.</p>}
    {clues && <>
      {!clues.length ? <p>등록된 단서가 없습니다.</p> : <div className="admin-table-wrap"><table className="admin-data-table intelligence-admin-table"><caption>판매 정보와 연동 사건</caption><thead><tr><th scope="col">제목</th><th scope="col">연동 사건</th><th scope="col">공개 월</th><th scope="col">가격</th><th scope="col">상태</th><th scope="col">작업</th></tr></thead><tbody>{clues.map(item => <tr key={item.clueId}><th scope="row"><strong>{item.title}</strong><small>{item.summary}</small></th><td>{item.eventTitle || '연관없음'}</td><td>{item.availableRound}월</td><td>{item.price.toLocaleString('ko-KR')}원</td><td><span className={`admin-state admin-state--${item.isActive && item.eventState !== 'APPLIED' ? 'active' : 'inactive'}`}>{!item.isActive ? '판매 중단' : item.eventState === 'APPLIED' ? '사건 종료' : '판매'}</span></td><td><div className="event-actions">
        <button type="button" className="secondary-button" disabled={!editable} aria-label={`${item.title} 정보 수정`} onClick={() => { setEditing(item.clueId); setForm({ ...item, eventId: item.eventId || '', price: String(item.price), availableRound: String(item.availableRound) }); setEditorOpen(true); setReview(null) }}>정보 수정</button>
        {item.isActive && <button type="button" className="secondary-button" disabled={!editable} aria-label={`${item.title} 정보 삭제`} onClick={() => setReview(item)}>정보 삭제</button>}
      </div></td></tr>)}</tbody></table></div>}
      <div className="list-toolbar"><p>본문은 구매자에게만 공개됩니다.</p><button type="button" className="primary-button" disabled={!editable} onClick={() => { setEditing(null); setForm(blank()); setEditorOpen(true) }}>새 단서 등록</button></div>
      <ActionDialog open={editorOpen} title={editing ? '단서 수정' : '새 단서 등록'} eyebrow="INTELLIGENCE" onClose={() => { setEditorOpen(false); setEditing(null); setForm(blank()) }} busy={busy} dirty={draftDirty}>
      <form className="event-form" noValidate onSubmit={save}><fieldset disabled={!editable}>
        <label htmlFor="clue-title">단서 제목</label><input id="clue-title" name="title" maxLength={100} value={form.title} onChange={change}/>
        <label htmlFor="clue-summary">구매 전 공개 요약</label><textarea id="clue-summary" name="summary" maxLength={500} value={form.summary} onChange={change}/>
        <label htmlFor="clue-content">구매자 전용 본문</label><textarea id="clue-content" name="content" rows={5} maxLength={5000} value={form.content} onChange={change}/>
        <label htmlFor="clue-event">연관 사건</label><select id="clue-event" name="eventId" value={form.eventId || ''} onChange={change}><option value="">연관없음</option>{events.map(item => <option key={item.eventId} value={item.eventId}>{item.schedule ? `${item.schedule.round}월 · ${item.schedule.triggerPhase === 'INTRADAY' ? '장중' : '마감'} · ` : '미배정 · '}{item.title}{item.schedule?.appliedAt ? ' (적용 완료)' : ''}</option>)}</select>
        {events.find(item => item.eventId === form.eventId)?.schedule?.appliedAt && <p className="form-error" role="alert">이미 적용된 사건입니다. 새 판매 정보와 연결하면 참가자 상점에는 노출되지 않습니다.</p>}
        <label htmlFor="clue-price">가격 (원)</label><input id="clue-price" name="price" inputMode="numeric" value={form.price} onChange={change}/>
        <label htmlFor="clue-round">공개 시작 월</label><input id="clue-round" name="availableRound" inputMode="numeric" value={form.availableRound} onChange={change}/>
        <label className="reset-ack"><input name="isActive" type="checkbox" checked={form.isActive} onChange={change}/>상점에서 판매</label>
        <div className="dialog-actions"><button className="secondary-button" type="button" onClick={requestDialogClose}>취소</button><button className="primary-button" type="submit">{editing ? '단서 수정 저장' : '단서 등록'}</button></div>
      </fieldset></form>
      </ActionDialog>
      <ConfirmDialog open={Boolean(review)} title="정보 삭제" onCancel={() => setReview(null)} onConfirm={deactivate} busy={busy} confirmDisabled={!editable} confirmLabel="정보 삭제" danger><p>{review?.title} 판매를 중단할까요? 기존 구매자는 보관함에서 계속 볼 수 있습니다.</p></ConfirmDialog>
    </>}
  </Panel>
}
