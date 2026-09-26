import { useDraftGuard } from '../navigation/NavigationGuard'
import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
import ActionDialog, { ConfirmDialog, requestDialogClose } from '../components/ActionDialog'
import { money } from '../game/model'
import { companyError, companyInput, companyRequest } from './api'
const blank = () => ({ companyId: '', name: '', description: '', initialPrice: '10000', isActive: true })
export function canManageCompanies({ status, stale, busy, fresh, uncertain }) {
  return status === 'WAITING' && !stale && !busy && fresh && !uncertain
}
export default function CompanyManager({ password, game, stale, onBusy, onChanged }) {
  const [companies, setCompanies] = useState(null)
  const [fresh, setFresh] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState(blank)
  const [editing, setEditing] = useState(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [deactivating, setDeactivating] = useState(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [validation, setValidation] = useState('')
  const draftDirty = JSON.stringify(form) !== JSON.stringify(blank())
  useDraftGuard(editorOpen && draftDirty)
  const locked = useRef(false)
  const generation = useRef(0)
  const canEdit = canManageCompanies({ status: game?.status, stale, busy, fresh, uncertain })
  // Keep drafts during game updates and polling. Only explicit actions replace them.
  useEffect(() => {
    ++generation.current
    setCompanies(null); setFresh(false); setForm(blank()); setEditing(null); setEditorOpen(false); setDeactivating(null); setError(''); setMessage(''); setUncertain(false)
    return () => { ++generation.current }
  }, [password])
  useEffect(() => { if (game?.status !== 'WAITING' || stale) setDeactivating(null) }, [game?.status, stale])
  const run = async (work, write = false) => {
    if (locked.current) return
    locked.current = true; setBusy(true); onBusy(true); setError(''); setMessage('')
    const version = generation.current
    const current = () => version === generation.current
    try { await work(current) }
    catch (failure) {
      if (current()) {
        setError(companyError(failure)); setFresh(false)
        if (write && failure.uncertain) setUncertain(true)
      }
    } finally {
      locked.current = false
      if (current()) { setBusy(false); onBusy(false) }
    }
  }
  const load = () => run(async current => {
    const list = await companyRequest('', { password })
    if (current()) {
      setCompanies(list); setFresh(true); setUncertain(false); setDeactivating(null)
      setMessage('최신 목록을 확인했습니다. 입력 중인 내용은 유지됩니다. 저장 결과를 목록과 비교해 주세요.')
      if (uncertain) onChanged()
    }
  })
  const edit = company => {
    if (!canEdit) return
    setEditing(company.companyId); setForm({ ...company, initialPrice: String(company.initialPrice) }); setEditorOpen(true); setValidation(''); setDeactivating(null); setMessage('')
  }
  const save = event => {
    event.preventDefault()
    if (!canEdit) return
    let body
    try { body = companyInput(form, Boolean(editing)); setValidation('') } catch (failure) { setValidation(companyError(failure)); return }
    run(async current => {
      const company = await companyRequest(editing ? `/${encodeURIComponent(editing)}` : '', { password, method: editing ? 'PUT' : 'POST', body })
      if (current()) {
        setCompanies(list => [...list.filter(c => c.companyId !== company.companyId), company].sort((a, b) => a.companyId.localeCompare(b.companyId)))
        setForm(blank()); setEditing(null); setEditorOpen(false); setDeactivating(null); setMessage(`${company.name} 종목을 저장했습니다.`); onChanged()
      }
    }, true)
  }
  const reviewDeactivation = companyId => {
    if (!canEdit) return
    // Obtain current reference counts immediately before presenting the warning.
    run(async current => {
      const list = await companyRequest('', { password })
      if (!current()) return
      setCompanies(list); setFresh(true)
      const company = list.find(c => c.companyId === companyId)
      if (!company) throw new Error('COMPANY_NOT_FOUND')
      if (!company.isActive) { setMessage('이미 비활성 상태입니다.'); return }
      setAcknowledged(false); setDeactivating(company)
    })
  }
  const deactivate = () => {
    if (!canEdit || !deactivating || !acknowledged) return
    const company = deactivating
    run(async current => {
      await companyRequest(`/${encodeURIComponent(company.companyId)}`, { password, method: 'DELETE' })
      if (current()) {
        setCompanies(list => list.map(c => c.companyId === company.companyId ? { ...c, isActive: false } : c))
        setDeactivating(null)
        if (editing === company.companyId) { setEditing(null); setEditorOpen(false); setForm(blank()) }
        setMessage(`${company.name} 종목을 비활성화했습니다. 과거 기록은 보존됩니다.`); onChanged()
      }
    }, true)
  }
  return <Panel title="주식 종목 관리">
    <p>종목 변경은 게임 대기 중에만 가능합니다. 진행·일시정지·종료 상태에서는 목록만 조회할 수 있습니다.</p>
    <button className="secondary-button" type="button" disabled={busy || stale} onClick={load}>{busy ? '처리 중...' : '종목 목록 조회'}</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    {message && <p role="status">{message}</p>}
    {uncertain && <p className="form-error" role="alert">변경 결과가 불확실합니다. 자동 재전송하지 않습니다. 목록을 다시 조회해 반영 여부를 확인한 뒤 다음 작업을 진행하세요.</p>}
    {!fresh && companies && <p className="trading-help">아래는 마지막으로 확인한 목록입니다. 다시 조회하기 전에는 변경할 수 없습니다.</p>}
    {companies === null ? <p className="empty-state">목록을 조회하면 활성·비활성 종목을 확인할 수 있습니다.</p> : <CompanyList companies={companies} canEdit={canEdit} onEdit={edit} onDeactivate={reviewDeactivation} />}
    {companies && <div className="list-toolbar"><p>등록할 종목이 있으면 전용 편집 창을 여세요.</p><button className="primary-button" type="button" disabled={!canEdit} onClick={() => { setEditing(null); setForm(blank()); setValidation(''); setEditorOpen(true) }}>새 종목 등록</button></div>}
    <ActionDialog open={editorOpen} title={editing ? `${editing} 종목 수정` : '새 종목 등록'} eyebrow="COMPANY" onClose={() => { setEditorOpen(false); setEditing(null); setForm(blank()); setValidation('') }} busy={busy} dirty={draftDirty}>
    <form className="company-form" onSubmit={save} noValidate aria-busy={busy}>
      <fieldset disabled={!canEdit}>
        <legend className="sr-only">종목 입력</legend>
        <label htmlFor="company-code">종목 코드</label><input id="company-code" value={form.companyId} disabled={Boolean(editing)} maxLength={20} autoCapitalize="characters" autoComplete="off" onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))} aria-describedby="company-code-help" />
        <p id="company-code-help" className="trading-help">영문·숫자·밑줄·하이픈, 최대 20자. 소문자는 대문자로 저장되며 등록 후 코드는 바꿀 수 없습니다.</p>
        <label htmlFor="company-name">종목 이름</label><input id="company-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        <label htmlFor="company-description">기업 설명</label><textarea id="company-description" rows={3} maxLength={2000} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} aria-describedby="company-description-help" /><p id="company-description-help" className="trading-help">설명은 줄바꿈 없이 최대 2,000자로 입력하세요. 비워두어도 됩니다.</p>
        <label htmlFor="company-price">초기 가격 (원)</label><input id="company-price" inputMode="numeric" value={form.initialPrice} onChange={e => setForm(f => ({ ...f, initialPrice: e.target.value }))} />
        <p className="trading-help">초기 가격을 변경하면 현재 가격도 같은 값으로 바뀝니다.</p>
        <label className="reset-ack"><input type="checkbox" checked={form.isActive} disabled={Boolean(editing && companies?.find(c => c.companyId === editing)?.isActive)} onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))} />활성 종목으로 사용</label>
        {editing && <p className="trading-help">활성 종목의 비활성화는 목록의 ‘비활성화’에서 기록 참조 안내를 확인한 뒤 진행합니다. 비활성 종목은 위 항목을 체크하고 저장하면 다시 활성화됩니다.</p>}
        {validation && <p className="form-error" role="alert">{validation}</p>}
        <div className="dialog-actions"><button className="secondary-button" type="button" onClick={requestDialogClose}>취소</button><button className="primary-button" type="submit">{editing ? '종목 수정 저장' : '종목 등록'}</button></div>
      </fieldset>
    </form>
    </ActionDialog>
    <ConfirmDialog open={Boolean(deactivating)} title={`${deactivating?.name || ''} 종목 비활성화`} onCancel={() => setDeactivating(null)} onConfirm={deactivate} busy={busy} confirmDisabled={!acknowledged || !canEdit} confirmLabel="비활성화 확정" danger>
      {deactivating && <><CompanyReferences references={deactivating.references} /><p>종목과 과거 기록은 삭제되지 않습니다. 비활성화하면 신규 주문·사건 영향 종목·새 사건 배정에서 제외됩니다.</p><label className="reset-ack"><input type="checkbox" disabled={busy} checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} />기록 보존과 신규 사용 제한을 확인했습니다.</label>{!acknowledged && <p className="trading-help">확인 항목을 체크해야 비활성화를 진행할 수 있습니다.</p>}</>}
    </ConfirmDialog>
  </Panel>
}
export function CompanyReferences({ references }) {
  return <p>참조 기록: 거래 {references.transactions}건 · 보유 {references.holdings}건 · 사건 효과 {references.eventEffects}건. 과거 기록은 보존됩니다.</p>
}
export function CompanyList({ companies, canEdit, onEdit, onDeactivate }) {
  if (!companies.length) return <p className="empty-state">등록된 종목이 없습니다.</p>
  return <ul className="company-list">{companies.map(company => <li key={company.companyId}><h3>{company.name} <small>({company.companyId})</small></h3><p>{company.isActive ? '활성' : '비활성'} · 초기 가격 {money(company.initialPrice)} · 현재 가격 {money(company.currentPrice)}</p>{company.description && <p>{company.description}</p>}<CompanyReferences references={company.references} /><div className="control-grid"><button className="secondary-button" type="button" disabled={!canEdit} onClick={() => onEdit(company)}>{company.name} 수정</button>{company.isActive && <button className="secondary-button" type="button" disabled={!canEdit} onClick={() => onDeactivate(company.companyId)}>{company.name} 비활성화</button>}</div></li>)}</ul>
}
