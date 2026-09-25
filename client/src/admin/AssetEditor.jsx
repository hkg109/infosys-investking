import { useEffect, useState } from 'react'
import ActionDialog from '../components/ActionDialog'
import { useDraftGuard } from '../navigation/NavigationGuard'
import { companyRequest } from '../companies/api'
import { getParticipants } from './participants'
import { adjustmentRequest, assetInput, assetError } from './asset-adjustments'
import { money } from '../game/model'

export default function AssetEditor({ participant, password, game, stale, onBusy, onChanged, onClose }) {
  const key = `investking:asset-adjustment:${participant.userId}`
  const [pending, setPending] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(key)) || null } catch { return null }
  })
  const [baseline, setBaseline] = useState(null)
  const [companies, setCompanies] = useState([])
  const [history, setHistory] = useState([])
  const [form, setForm] = useState({ cash: '', companyId: '', quantity: '0', reason: '' })
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0)
  const dirty = Boolean(pending || preview || form.reason || form.companyId || (baseline && form.cash !== String(baseline.cash)))
  useDraftGuard(dirty, busy)
  useEffect(() => { onBusy?.(busy); return () => onBusy?.(false) }, [busy, onBusy])
  useEffect(() => {
    let active = true
    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 8000)
    setLoading(true); setBaseline(null)
    Promise.all([getParticipants(password, abort.signal), companyRequest('', { password, signal: abort.signal }), adjustmentRequest(participant.userId, password)])
      .then(([data, list, rows]) => {
        if (!active) return
        const current = data.participants.find(p => p.userId === participant.userId)
        if (!current) throw new Error('PARTICIPANT_NOT_FOUND')
        setBaseline(current); setCompanies(list); setHistory(rows)
        setForm({ cash: String(current.cash), companyId: '', quantity: '0', reason: '' })
      }).catch(e => { if (active) setError(assetError(e)) })
      .finally(() => { clearTimeout(timeout); if (active) setLoading(false) })
    return () => { active = false; clearTimeout(timeout); abort.abort() }
  }, [participant.userId, password, version])
  const enabled = baseline && !loading && !busy && !pending && !stale && ['WAITING', 'PAUSED'].includes(game?.status)
  const fieldsDisabled = !enabled || Boolean(preview)
  const reload = () => { setError(''); setPreview(null); setVersion(v => v + 1) }
  async function save(body) {
    if (busy) return
    // Persist before sending so a lost response or tab reload cannot create another adjustment.
    try { sessionStorage.setItem(key, JSON.stringify(body)) } catch { setError('요청 복구 정보를 보관할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.'); return }
    const recovering = Boolean(pending)
    setPending(body); setBusy(true); setError(''); setNotice('')
    try {
      const result = await adjustmentRequest(participant.userId, password, body)
      sessionStorage.removeItem(key); setPending(null); setPreview(null)
      setNotice(result.duplicate ? '이미 저장된 수정 결과를 확인했습니다.' : '자산을 수정했습니다. 참가자와 순위 화면에도 반영됩니다.')
      onChanged(); setVersion(v => v + 1)
    } catch (e) {
      // These errors are checked after idempotency lookup, and prove that this request did not commit.
      const definite = ['ASSET_CONFLICT', 'ASSET_ADJUSTMENT_CLOSED', 'NO_ASSET_CHANGE', 'COMPANY_INACTIVE', 'COMPANY_NOT_FOUND', 'PARTICIPANT_NOT_FOUND', 'ASSET_LIMIT_EXCEEDED', 'ADJUSTMENT_ID_CONFLICT'].includes(e.message)
      if (definite || (!recovering && !e.uncertain)) {
        sessionStorage.removeItem(key); setPending(null); setPreview(null); setBaseline(null)
      }
      setError(assetError(e))
    } finally { setBusy(false) }
  }
  return <ActionDialog open title={`${participant.nickname} 참가자 자산`} eyebrow="ADMIN ONLY" width="small" busy={busy} dirty={dirty && !pending} onClose={onClose}>
    <p>대기·일시정지 중 현금과 종목 하나의 보유량을 수정합니다. 입력값은 변경 후 최종 잔액·수량입니다.</p>
    {loading && <p role="status">최신 자산과 변경 기록을 불러오는 중입니다.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {pending ? <section aria-label="저장 결과 확인"><p>아래 요청의 결과를 확인 중입니다. 새 수정을 보내기 전에 같은 요청으로 저장 여부를 확인해 주세요. 이 탭을 새로고침해도 요청을 복구합니다.</p><p>현금 {money(pending.expectedCash)} → {money(pending.cash)}{pending.companyId && ` · ${pending.companyId}: ${pending.expectedQuantity} → ${pending.quantity}주`}</p><p>사유: {pending.reason}</p><button className="primary-button" disabled={busy} onClick={() => save(pending)}>{busy ? '확인 중…' : '같은 요청으로 결과 확인'}</button></section> : <>
      {baseline && <><p>총자산 {money(baseline.totalAssets)} · 현금 {money(baseline.cash)}</p><h3>현재 보유 종목</h3>{baseline.holdings.length ? <ul className="participant-holdings">{baseline.holdings.map(h => <li key={h.companyId}>{h.name} · {h.quantity.toLocaleString('ko-KR')}주 · {money(h.marketValue)}</li>)}</ul> : <p>보유 종목이 없습니다.</p>}</>}
      {!enabled && !loading && <p>최신 상태를 확인하고 게임을 대기 또는 일시정지 상태로 두어 주세요.</p>}
      <button type="button" className="secondary-button" disabled={busy || loading} onClick={reload}>입력 초기화·최신 값 불러오기</button>
      <form className="entry-form" onSubmit={event => { event.preventDefault(); if (!enabled) return; try { setPreview(assetInput(baseline, form)); setError('') } catch (e) { setError(assetError(e)) } }}>
        <fieldset disabled={fieldsDisabled} className="asset-fields" aria-label="자산 수정 입력">
          <label>변경 후 현금 (원)<input disabled={fieldsDisabled} inputMode="numeric" value={form.cash} onChange={e => setForm({ ...form, cash: e.target.value })} required /></label>
          <label>수정할 종목<select disabled={fieldsDisabled} value={form.companyId} onChange={e => setForm({ ...form, companyId: e.target.value, quantity: String(baseline?.holdings.find(h => h.companyId === e.target.value)?.quantity || 0) })}><option value="">주식 변경 안 함</option>{companies.map(c => <option key={c.companyId} value={c.companyId}>{c.name} ({c.companyId}){!c.isActive ? ' · 비활성' : ''}</option>)}</select></label>
          {form.companyId && <label>변경 후 보유 수량 (주)<input disabled={fieldsDisabled} inputMode="numeric" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} required /></label>}
          <label>수정 사유<input disabled={fieldsDisabled} value={form.reason} maxLength={300} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="예: 운영 중 잘못 지급한 현금 정정" required /></label>
          <button className="primary-button" type="submit" disabled={fieldsDisabled}>변경 내용 확인</button>
        </fieldset>
      </form>
      {preview && <section aria-label="자산 수정 최종 확인"><h3>이 내용으로 수정할까요?</h3><p>현금 {money(preview.expectedCash)} → {money(preview.cash)}</p>{preview.companyId && <p>{preview.companyId} 보유량 {preview.expectedQuantity} → {preview.quantity}주</p>}<p>사유: {preview.reason}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setPreview(null)}>계속 편집</button><button className="primary-button" disabled={!enabled} onClick={() => save(preview)}>수정 확정</button></div></section>}
    </>}
    <h3>최근 변경 기록 (최대 50건)</h3>
    {history.length ? <ol className="asset-history">{history.map(row => <li key={row.requestId}><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('ko-KR')}</time><p>현금 {money(row.before.cash)} → {money(row.after.cash)}{row.companyId && ` · ${row.companyId}: ${row.before.quantity} → ${row.after.quantity}주`}</p><p>{row.reason}</p></li>)}</ol> : <p>확인된 변경 기록이 없습니다.</p>}
  </ActionDialog>
}
