import { useDraftGuard } from '../navigation/NavigationGuard'
import { useState } from 'react'
import { eligibleEvents, scheduleDraft, scheduleInput } from './schedule'
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
    <p>거래 시간 {constraints.tradingDurationMs / 1000}초 · 장중 사건 최소 거래정지 {constraints.haltDurationMs / 1000}초. 뉴스 공개부터 거래정지 종료까지 다른 사건과 겹치면 안 됩니다.</p>
    <fieldset disabled={!canEdit}>
      <legend>수동 배정 초안</legend>
      <p>목록을 다시 조회해도 초안은 유지됩니다. 아래 버튼으로 조회한 서버 배정을 초안에 불러올 수 있습니다.</p>
      <button className="secondary-button" type="button" onClick={() => { setRows(scheduleDraft(schedule)); setReview(null); setError('') }}>서버 배정으로 초안 되돌리기</button>
      {rows.length > 0 && <div className="admin-table-wrap"><table className="admin-data-table schedule-draft-table"><caption>월별 사건 배정 초안</caption><thead><tr><th scope="col">월</th><th scope="col">사건</th><th scope="col">구간</th><th scope="col">뉴스 공개</th><th scope="col">주가 변동</th><th scope="col">순서</th><th scope="col">작업</th></tr></thead><tbody>{rows.map((row,index) => <tr key={index}>
        <td><label className="sr-only" htmlFor={`schedule-round-${index}`}>배정 {index + 1} 월</label><select id={`schedule-round-${index}`} value={row.round} onChange={e => update(index, 'round', e.target.value)}>{Array.from({length: constraints.totalRounds}, (_,i) => <option key={i+1} value={i+1}>{i+1}월</option>)}</select></td>
        <td><label className="sr-only" htmlFor={`schedule-event-${index}`}>배정 {index + 1} 사건</label><select id={`schedule-event-${index}`} value={row.eventId} onChange={e => update(index, 'eventId', e.target.value)}><option value="">사건 선택</option>{events.map(event => <option key={event.eventId} value={event.eventId} disabled={!eligible.some(e => e.eventId === event.eventId)}>{event.title}{!eligible.some(e => e.eventId === event.eventId) ? ' (비활성 종목 포함)' : ''}</option>)}</select></td>
        <td><label className="sr-only" htmlFor={`schedule-phase-${index}`}>배정 {index + 1} 주가 변동 구간</label><select id={`schedule-phase-${index}`} value={row.triggerPhase} onChange={e => update(index, 'triggerPhase', e.target.value)}><option value="CLOSE">마감</option><option value="INTRADAY">장중</option></select></td>
        <td><label className="sr-only" htmlFor={`schedule-news-${index}`}>배정 {index + 1} 뉴스 공개 초</label><input id={`schedule-news-${index}`} inputMode="numeric" value={row.newsRevealOffsetSeconds} onChange={e => update(index, 'newsRevealOffsetSeconds', e.target.value)} /></td>
        <td>{row.triggerPhase === 'INTRADAY' ? <><label className="sr-only" htmlFor={`schedule-price-${index}`}>배정 {index + 1} 주가 변동 초</label><input id={`schedule-price-${index}`} inputMode="numeric" value={row.triggerOffsetSeconds} onChange={e => update(index, 'triggerOffsetSeconds', e.target.value)} /></> : <span className="admin-readonly-value">거래 마감</span>}</td>
        <td><label className="sr-only" htmlFor={`schedule-order-${index}`}>배정 {index + 1} 표시 순서</label><input id={`schedule-order-${index}`} inputMode="numeric" value={row.displayOrder} onChange={e => update(index, 'displayOrder', e.target.value)} /></td>
        <td><button className="secondary-button" type="button" onClick={() => { setRows(list => list.filter((_,i) => i !== index)); setReview(null) }}>제거</button></td>
      </tr>)}</tbody></table></div>}
      {!rows.length && <p>초안에 배정된 사건이 없습니다. 이 상태로 저장하면 전체 월을 사건 없이 진행합니다.</p>}
      <button className="secondary-button" type="button" disabled={rows.length >= eligible.length} onClick={() => { setRows(list => [...list, { round: '1', eventId: '', displayOrder: String(Math.max(0,...list.filter(r=>r.round === '1').map(r=>Number(r.displayOrder)||0))+1), triggerPhase: 'CLOSE', triggerOffsetSeconds: '', newsRevealOffsetSeconds: '0' }]); setReview(null) }}>배정 행 추가</button>
      <button className="primary-button" type="button" onClick={() => prepare()}>수동 배정 검토</button>
    </fieldset>
    {error && <p className="form-error" role="alert">{error}</p>}
    {review && <section className="end-confirmation" aria-label="배정 교체 확인"><h4>전체 배정을 교체할까요?</h4><p>{`수동 배정 ${rows.length}개`}로 서버의 기존 전체 배정을 교체합니다. 사건 원본은 유지됩니다.</p><button className="secondary-button" type="button" onClick={() => setReview(null)}>배정 취소</button><button className="primary-button" type="button" disabled={!canEdit} onClick={save}>배정 교체 확정</button></section>}
    <h4>서버에 저장된 월별 배정</h4>
    <div className="admin-table-wrap"><table className="admin-data-table schedule-saved-table"><caption>서버에 저장된 월별 사건 배정</caption><thead><tr><th scope="col">월</th><th scope="col">구간</th><th scope="col">뉴스 공개</th><th scope="col">주가 변동</th><th scope="col">사건</th><th scope="col">상태</th></tr></thead><tbody>{Array.from({length: constraints.totalRounds},(_,i) => {
      const month = i + 1, assigned = schedule.filter(item => item.round === month)
      return assigned.length ? assigned.map((item,index) => <tr key={item.gameEventId}><th scope="row">{index === 0 ? `${month}월` : ''}</th><td>{item.triggerPhase === 'INTRADAY' ? '장중' : '마감'}</td><td>{item.newsRevealOffsetSeconds}초</td><td>{item.triggerPhase === 'INTRADAY' ? `${item.triggerOffsetSeconds}초` : '거래 마감'}</td><td>{item.title}</td><td>{item.appliedAt ? '적용 완료' : item.warningSentAt ? '뉴스 공개' : '예정'}</td></tr>) : <tr key={month}><th scope="row">{month}월</th><td colSpan="5" className="admin-empty-cell">배정 없음</td></tr>
    })}</tbody></table></div>
  </section>
}
