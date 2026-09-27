import { useEffect, useState } from 'react'
import ActionDialog from '../components/ActionDialog'
import { useDraftGuard } from '../navigation/NavigationGuard'
import { companyRequest } from '../companies/api'
import { getParticipants } from './participants'
import { adjustmentRequest, assetInput, assetError } from './asset-adjustments'
import { money } from '../game/model'

export function assetEditBlock({ baseline, loading, busy, pending, stale, status }) {
  if (loading || !baseline) return '최신 자산 정보를 확인하는 중입니다.'
  if (busy || pending) return '이 참가자의 이전 수정 요청을 처리하고 있습니다.'
  if (stale) return '게임 또는 참가자 정보가 최신 상태가 아닙니다. 업데이트 후 다시 시도하세요.'
  if (!['WAITING', 'PAUSED'].includes(status)) return status === 'RUNNING' ? '게임 진행 중에는 주문과 자산 변경이 충돌할 수 있어 수정할 수 없습니다. 게임을 일시정지하세요.' : '게임 대기 또는 일시정지 상태에서만 자산을 수정할 수 있습니다.'
  return ''
}

export function estimatedTotalAssets(baseline, preview, companies = []) {
  if (!baseline || !preview) return null
  let total = baseline.totalAssets + preview.cash - baseline.cash
  if (preview.companyId) {
    const holding = baseline.holdings.find(item => item.companyId === preview.companyId)
    const company = companies.find(item => item.companyId === preview.companyId)
    const price = holding?.currentPrice ?? company?.currentPrice
    if (!Number.isSafeInteger(price)) return null
    total += (preview.quantity - preview.expectedQuantity) * price
  }
  return Number.isSafeInteger(total) && total >= 0 ? total : null
}

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
  const [conflict, setConflict] = useState(null)
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
  const block = assetEditBlock({ baseline, loading, busy, pending, stale, status: game?.status })
  const enabled = !block && !conflict
  const fieldsDisabled = !enabled || Boolean(preview)
  const reload = () => { setError(''); setConflict(null); setPreview(null); setVersion(v => v + 1) }
  async function save(body) {
    if (busy) return
    // Persist before sending so a lost response or tab reload cannot create another adjustment.
    try { sessionStorage.setItem(key, JSON.stringify(body)) } catch { setError('요청 복구 정보를 보관할 수 없습니다. 브라우저 저장소 설정을 확인해 주세요.'); return }
    const recovering = Boolean(pending)
    setPending(body); setBusy(true); setError(''); setNotice('')
    try {
      const result = await adjustmentRequest(participant.userId, password, body)
      sessionStorage.removeItem(key); setPending(null); setPreview(null); setConflict(null)
      setNotice(result.duplicate ? '이미 저장된 수정 결과를 확인했습니다.' : '자산을 수정했습니다. 참가자와 순위 화면에도 반영됩니다.')
      onChanged(); setVersion(v => v + 1)
    } catch (e) {
      // These errors are checked after idempotency lookup, and prove that this request did not commit.
      const definite = ['ASSET_CONFLICT', 'ASSET_ADJUSTMENT_CLOSED', 'NO_ASSET_CHANGE', 'COMPANY_INACTIVE', 'COMPANY_NOT_FOUND', 'PARTICIPANT_NOT_FOUND', 'ASSET_LIMIT_EXCEEDED', 'ADJUSTMENT_ID_CONFLICT'].includes(e.message)
      if (e.message === 'ASSET_CONFLICT' && e.current) {
        sessionStorage.removeItem(key); setPending(null); setPreview(null)
        setConflict({ ...e.current, companyId: body.companyId || null })
      } else if (definite || (!recovering && !e.uncertain)) {
        sessionStorage.removeItem(key); setPending(null); setPreview(null); setBaseline(null)
      }
      setError(assetError(e))
    } finally { setBusy(false) }
  }
  return <ActionDialog open title={`${participant.nickname} 참가자 자산`} eyebrow="ADMIN ONLY" width="small" busy={busy} dirty={dirty && !pending} onClose={onClose}>
    <p>대기·일시정지 중 현금과 종목 하나의 보유량을 수정합니다. 입력값은 변경 후 최종 잔액·수량입니다.</p>
    {loading && <p role="status">최신 자산과 변경 기록을 불러오는 중입니다.</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {conflict && <section className="asset-conflict" role="alert"><h3>서버 최신 자산</h3><p>현금 {money(conflict.cash)}{conflict.companyId && ` · ${conflict.companyId} ${conflict.quantity.toLocaleString('ko-KR')}주`}</p><p>작성한 값은 저장되지 않았습니다. 최신 값을 다시 불러온 뒤 변경 내용을 확인해 주세요.</p><button type="button" className="secondary-button" onClick={reload}>최신 값 불러오기</button></section>}
    {notice && <p role="status">{notice}</p>}
    {pending ? <section aria-label="저장 결과 확인"><p>아래 요청의 결과를 확인 중입니다. 새 수정을 보내기 전에 같은 요청으로 저장 여부를 확인해 주세요. 이 탭을 새로고침해도 요청을 복구합니다.</p><p>현금 {money(pending.expectedCash)} → {money(pending.cash)}{pending.companyId && ` · ${pending.companyId}: ${pending.expectedQuantity} → ${pending.quantity}주`}</p><p>사유: {pending.reason}</p><button className="primary-button" disabled={busy} onClick={() => save(pending)}>{busy ? '확인 중…' : '같은 요청으로 결과 확인'}</button></section> : <>
      {baseline && <><p>총자산 {money(baseline.totalAssets)} · 현금 {money(baseline.cash)}</p><h3>현재 보유 종목</h3>{baseline.holdings.length ? <ul className="participant-holdings">{baseline.holdings.map(h => <li key={h.companyId}>{h.name} · {h.quantity.toLocaleString('ko-KR')}주 · {money(h.marketValue)}</li>)}</ul> : <p>보유 종목이 없습니다.</p>}</>}
      {!enabled && !loading && !conflict && <p className="asset-edit-block" role="status">{block}</p>}
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
      {preview && <section className="asset-preview" aria-label="자산 수정 최종 확인"><h3>이 내용으로 수정할까요?</h3><dl><div className={preview.cash !== preview.expectedCash ? 'asset-change' : ''}><dt>현금</dt><dd>{money(preview.expectedCash)} → <strong>{money(preview.cash)}</strong></dd></div>{preview.companyId && <div className={preview.quantity !== preview.expectedQuantity ? 'asset-change' : ''}><dt>{companies.find(item => item.companyId === preview.companyId)?.name || preview.companyId} 보유량</dt><dd>{preview.expectedQuantity.toLocaleString('ko-KR')}주 → <strong>{preview.quantity.toLocaleString('ko-KR')}주</strong></dd></div>}<div className="asset-change asset-total-preview"><dt>수정 후 예상 총자산</dt><dd><strong>{money(estimatedTotalAssets(baseline, preview, companies))}</strong></dd></div></dl><p>사유: {preview.reason}</p><div className="dialog-actions"><button className="secondary-button" onClick={() => setPreview(null)}>계속 편집</button><button className="primary-button" disabled={!enabled} onClick={() => save(preview)}>수정 확정</button></div></section>}
    </>}
    <h3>최근 변경 기록 (최대 50건)</h3>
    {history.length ? <ol className="asset-history">{history.map(row => <li key={row.requestId}><time dateTime={row.createdAt}>{new Date(row.createdAt).toLocaleString('ko-KR')}</time><p>현금 {money(row.before.cash)} → {money(row.after.cash)}{row.companyId && ` · ${row.companyId}: ${row.before.quantity} → ${row.after.quantity}주`}</p><p>{row.reason}</p></li>)}</ol> : <p>확인된 변경 기록이 없습니다.</p>}
  </ActionDialog>
}
