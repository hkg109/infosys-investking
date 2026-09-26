import { useDraftGuard } from '../navigation/NavigationGuard'
import { useState } from 'react'
import { eligibleEvents, eventTiming, scheduleDraft, scheduleInput } from './schedule'
import { eventError } from './api'
export default function ScheduleEditor({ events, companies, schedule, constraints, canEdit, onWrite }) {
  const [rows, setRows] = useState(() => scheduleDraft(schedule))
  const [error, setError] = useState('')
  const [review, setReview] = useState(null)
  useDraftGuard(JSON.stringify(rows) !== JSON.stringify(scheduleDraft(schedule)) || Boolean(review))
  const eligible = eligibleEvents(events, companies)
  const update = (index, key, value) => { setReview(null); setRows(list => list.map((r,i) => i === index ? { ...r, [key]: value } : r)) }
  const prepare = () => {
    try {
      const body = scheduleInput(rows, constraints, eligible)
      setReview({ body }); setError('')
    } catch (failure) { setError(eventError(failure)); setReview(null) }
  }
  const save = async () => {
    if (!canEdit || !review) return
    const result = await onWrite(review.body)
    setReview(null)
    if (result) setRows(scheduleDraft(result))
  }
  return <section className="schedule-editor" aria-label="월별 사건 배정">
    <h3>월별 사건 배정</h3>
    <p>한 달에 0~10개를 배정할 수 있습니다. 같은 사건은 전체 게임에서 한 번만 사용합니다. 배정되지 않은 달에는 사건이 없습니다. 게임 시작·서버 재시작 시 사건을 자동으로 추가하지 않습니다.</p>
    <p>배정 가능 사건 {eligible.length}개 / 전체 {events.length}개. 비활성 종목을 포함한 사건은 배정할 수 없습니다.</p>
    <p>거래 시간 {constraints.tradingDurationMs / 1000}초 · 장중 사건 최소 거래정지 {constraints.haltDurationMs / 1000}초. 예고 시작부터 거래정지 종료까지 다른 사건과 겹치면 안 됩니다.</p>
    <fieldset disabled={!canEdit}>
      <legend>수동 배정 초안</legend>
      <p>목록을 다시 조회해도 초안은 유지됩니다. 아래 버튼으로 조회한 서버 배정을 초안에 불러올 수 있습니다.</p>
      <button className="secondary-button" type="button" onClick={() => { setRows(scheduleDraft(schedule)); setReview(null); setError('') }}>서버 배정으로 초안 되돌리기</button>
      {rows.map((row,index) => <div className="schedule-row" key={index}>
        <h4>배정 {index + 1}</h4>
        <label>월 {index + 1}<select value={row.round} onChange={e => update(index, 'round', e.target.value)}>{Array.from({length: constraints.totalRounds}, (_,i) => <option key={i+1} value={i+1}>{i+1}월</option>)}</select></label>
        <label>사건 {index + 1}<select value={row.eventId} onChange={e => update(index, 'eventId', e.target.value)}><option value="">사건 선택</option>{events.map(event => <option key={event.eventId} value={event.eventId} disabled={!eligible.some(e => e.eventId === event.eventId)}>{event.title}{!eligible.some(e => e.eventId === event.eventId) ? ' (비활성 종목 포함)' : ''}</option>)}</select></label>
        <label>발생 구분 {index + 1}<select value={row.triggerPhase} onChange={e => update(index, 'triggerPhase', e.target.value)}><option value="CLOSE">마감 후</option><option value="INTRADAY">거래 중</option></select></label>
        <label>표시·마감 처리 순서 {index + 1}<input inputMode="numeric" value={row.displayOrder} onChange={e => update(index, 'displayOrder', e.target.value)} /></label>
        {row.triggerPhase === 'INTRADAY' && <><label>월 시작 후 발생 초 {index + 1}<input inputMode="numeric" value={row.triggerOffsetSeconds} onChange={e => update(index, 'triggerOffsetSeconds', e.target.value)} /></label><label>발생 몇 초 전 예고 {index + 1}<input inputMode="numeric" value={row.preannounceSeconds} onChange={e => update(index, 'preannounceSeconds', e.target.value)} /></label><p>예고: 월 시작 {Number(row.triggerOffsetSeconds) - Number(row.preannounceSeconds)}초 후 / 발생: {row.triggerOffsetSeconds || '—'}초 후</p></>}
        <button className="secondary-button" type="button" onClick={() => { setRows(list => list.filter((_,i) => i !== index)); setReview(null) }}>배정 {index + 1} 제거</button>
      </div>)}
      {!rows.length && <p>초안에 배정된 사건이 없습니다. 이 상태로 저장하면 전체 월을 사건 없이 진행합니다.</p>}
      <button className="secondary-button" type="button" disabled={rows.length >= eligible.length} onClick={() => { setRows(list => [...list, { round: '1', eventId: '', displayOrder: String(Math.max(0,...list.filter(r=>r.round === '1').map(r=>Number(r.displayOrder)||0))+1), triggerPhase: 'CLOSE', triggerOffsetSeconds: '', preannounceSeconds: '0' }]); setReview(null) }}>배정 행 추가</button>
      <button className="primary-button" type="button" onClick={() => prepare()}>수동 배정 검토</button>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    {review && <section className="end-confirmation" aria-label="배정 교체 확인"><h4>전체 배정을 교체할까요?</h4><p>{`수동 배정 ${rows.length}개`}로 서버의 기존 전체 배정을 교체합니다. 사건 원본은 유지됩니다.</p><button className="secondary-button" type="button" onClick={() => setReview(null)}>배정 취소</button><button className="primary-button" type="button" disabled={!canEdit} onClick={save}>배정 교체 확정</button></section>}
    <h4>서버에 저장된 월별 배정</h4>
    {Array.from({length: constraints.totalRounds},(_,i) => <section key={i+1}><h5>{i+1}월</h5>{schedule.filter(s=>s.round === i+1).length ? <ul>{schedule.filter(s=>s.round === i+1).map(item => <li key={item.gameEventId}>{item.displayOrder}. {item.title} · {eventTiming(item)} · {item.appliedAt ? '적용 완료' : '예정'}</li>)}</ul> : <p>배정 없음</p>}</section>)}
  </section>
}
