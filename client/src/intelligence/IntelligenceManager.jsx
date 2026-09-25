import { useDraftGuard } from '../navigation/NavigationGuard'
import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
import ActionDialog, { ConfirmDialog, requestDialogClose } from '../components/ActionDialog'
import { clueInput, intelligenceError, intelligenceRequest } from './api'
const blank = () => ({ title: '', summary: '', content: '', price: '10', availableRound: '1', isActive: true })
export default function IntelligenceManager({ password, game, stale, onBusy }) {
  const [clues, setClues] = useState(null), [fresh, setFresh] = useState(false)
  const [form, setForm] = useState(blank), [editing, setEditing] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [busy, setBusy] = useState(false), [review, setReview] = useState(null)
  const [error, setError] = useState(''), [message, setMessage] = useState('')
  const draftDirty = JSON.stringify(form) !== JSON.stringify(blank())
  useDraftGuard(editorOpen && draftDirty)
  const lock = useRef(false), generation = useRef(0)
  useEffect(() => {
    ++generation.current; setClues(null); setFresh(false); setForm(blank()); setEditing(null); setEditorOpen(false); setReview(null)
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
    const data = await intelligenceRequest('/admin', { password })
    if (current()) { setClues(data.clues); setFresh(true); setReview(null); setMessage('최신 단서 목록을 확인했습니다. 입력 초안은 유지됩니다.') }
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
      {!clues.length ? <p>등록된 단서가 없습니다.</p> : <ul className="mission-list">{clues.map(item => <li key={item.clueId}><h3>{item.title}</h3><p>{item.summary}</p><details><summary>구매자에게 공개할 본문</summary><p className="intelligence-content">{item.content}</p></details><p>{item.price.toLocaleString('ko-KR')}원 · {item.availableRound}월부터 · {item.isActive ? '활성' : '비활성'}</p><div className="event-actions">
        <button type="button" className="secondary-button" disabled={!editable} onClick={() => { setEditing(item.clueId); setForm({ ...item, price: String(item.price), availableRound: String(item.availableRound) }); setEditorOpen(true); setReview(null) }}>{item.title} 수정</button>
        {item.isActive && <button type="button" className="secondary-button" disabled={!editable} onClick={() => setReview(item)}>{item.title} 비활성화</button>}
      </div></li>)}</ul>}
      <div className="list-toolbar"><p>본문은 구매자에게만 공개됩니다.</p><button type="button" className="primary-button" disabled={!editable} onClick={() => { setEditing(null); setForm(blank()); setEditorOpen(true) }}>새 단서 등록</button></div>
      <ActionDialog open={editorOpen} title={editing ? '단서 수정' : '새 단서 등록'} eyebrow="INTELLIGENCE" onClose={() => { setEditorOpen(false); setEditing(null); setForm(blank()) }} busy={busy} dirty={draftDirty}>
      <form className="event-form" noValidate onSubmit={save}><fieldset disabled={!editable}>
        <label htmlFor="clue-title">단서 제목</label><input id="clue-title" name="title" maxLength={100} value={form.title} onChange={change}/>
        <label htmlFor="clue-summary">구매 전 공개 요약</label><textarea id="clue-summary" name="summary" maxLength={500} value={form.summary} onChange={change}/>
        <label htmlFor="clue-content">구매자 전용 본문</label><textarea id="clue-content" name="content" rows={5} maxLength={5000} value={form.content} onChange={change}/>
        <label htmlFor="clue-price">가격 (원)</label><input id="clue-price" name="price" inputMode="numeric" value={form.price} onChange={change}/>
        <label htmlFor="clue-round">공개 시작 월</label><input id="clue-round" name="availableRound" inputMode="numeric" value={form.availableRound} onChange={change}/>
        <label className="reset-ack"><input name="isActive" type="checkbox" checked={form.isActive} onChange={change}/>상점에서 판매</label>
        <div className="dialog-actions"><button className="secondary-button" type="button" onClick={requestDialogClose}>취소</button><button className="primary-button" type="submit">{editing ? '단서 수정 저장' : '단서 등록'}</button></div>
      </fieldset></form>
      </ActionDialog>
      <ConfirmDialog open={Boolean(review)} title="단서 판매 중단" onCancel={() => setReview(null)} onConfirm={deactivate} busy={busy} confirmDisabled={!editable} confirmLabel="판매 중단 확정" danger><p>{review?.title} 판매를 중단할까요? 기존 구매자는 보관함에서 계속 볼 수 있습니다.</p></ConfirmDialog>
    </>}
  </Panel>
}
