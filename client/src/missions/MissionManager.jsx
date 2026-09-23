import { useDraftGuard } from '../navigation/NavigationGuard'
import { useEffect, useRef, useState } from 'react'
import Panel from '../components/Panel'
import ActionDialog, { ConfirmDialog, requestDialogClose } from '../components/ActionDialog'
import { canManageMissions, missionError, missionInput, missionRequest, missionTypes } from './api'
const blank=()=>({title:'',description:'',missionType:'DIVERSIFIED_HOLDINGS',targetValue:'3',rewardPoints:'30',isActive:true})
export default function MissionManager({password,game,stale,onBusy}) {
  const [data,setData]=useState(null), [fresh,setFresh]=useState(false), [busy,setBusy]=useState(false)
  const [form,setForm]=useState(blank), [editing,setEditing]=useState(null), [review,setReview]=useState(null)
  const [editorOpen,setEditorOpen]=useState(false)
  const [error,setError]=useState(''), [message,setMessage]=useState('')
  const draftDirty=JSON.stringify(form) !== JSON.stringify(blank())
  useDraftGuard(editorOpen && draftDirty)
  const lock=useRef(false), version=useRef(0)
  useEffect(()=>{++version.current;setData(null);setFresh(false);setForm(blank());setEditing(null);setEditorOpen(false);setReview(null);return()=>{++version.current}},[password])
  const canEdit=canManageMissions({status:game?.status,stale,busy,fresh})
  const run=async(work)=>{
    if(lock.current)return
    lock.current=true;setBusy(true);onBusy(true);setError('');setMessage('')
    const current=version.current
    try { const result=await work(()=>current===version.current); if(current===version.current)return result }
    catch(failure){if(current===version.current){setError(missionError(failure));setFresh(false);setReview(null)}}
    finally{lock.current=false;if(current===version.current){setBusy(false);onBusy(false)}}
  }
  const load=()=>run(async(current)=>{const next=await missionRequest('/admin',{password});if(!current())return;setData(next);setFresh(true);setReview(null);setMessage('최신 목록을 확인했습니다. 입력 초안은 유지됩니다.')})
  const save=event=>{
    event.preventDefault();if(!canEdit)return
    let body;try{body=missionInput(form)}catch(failure){setError(missionError(failure));return}
    run(async(current)=>{
      setFresh(false)
      const result=await missionRequest(editing?`/admin/${encodeURIComponent(editing)}`:'/admin',{password,method:editing?'PUT':'POST',body})
      if(!current())return
      setData(previous=>({...previous,missions:editing?previous.missions.map(m=>m.missionId===editing?result.mission:m):[...previous.missions,result.mission]}))
      setFresh(true);setForm(blank());setEditing(null);setEditorOpen(false);setReview(null);setMessage('미션을 저장했습니다.')
    })
  }
  const deactivate=()=>{
    if(!canEdit || !review)return
    run(async(current)=>{
      setFresh(false)
      await missionRequest(`/admin/${encodeURIComponent(review.missionId)}`,{password,method:'DELETE'})
      if(!current())return
      setData(previous=>({...previous,missions:previous.missions.map(m=>m.missionId===review.missionId?{...m,isActive:false}:m)}))
      if(editing===review.missionId){setEditing(null);setEditorOpen(false);setForm(blank())}
      setReview(null);setFresh(true);setMessage('미션을 비활성화했습니다. 기존 기록은 유지됩니다.')
    })
  }
  return <Panel title="비밀 미션 관리">
    <p>대기 중에만 미션을 변경할 수 있습니다. 활성 미션은 시작 시 참가자마다 하나씩 배정됩니다. 활성 미션이 없어도 게임은 시작할 수 있습니다.</p>
    <button className="secondary-button" type="button" disabled={busy||stale} onClick={load}>{busy?'미션 처리 중...':'미션 목록 조회'}</button>
    {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
    {!fresh&&data&&<p className="trading-help">마지막 확인 정보입니다. 변경 요청을 자동 재전송하지 않습니다. 목록을 재조회하여 반영 여부를 비교한 뒤 진행하세요.</p>}
    {data&&<>
      {!data.missions.length?<p>등록된 미션이 없습니다.</p>:<ul className="mission-list">{data.missions.map(m=><li key={m.missionId}><h3>{m.title}</h3><p>{m.description}</p><p>{missionTypes[m.missionType][0]} · 목표 {m.targetValue} {missionTypes[m.missionType][2]} · 보상 {m.rewardPoints} P · {m.isActive?'활성':'비활성'} · 배정 기록 {m.assignmentCount}건</p><div className="event-actions"><button type="button" className="secondary-button" disabled={!canEdit} onClick={()=>{setEditing(m.missionId);setForm({...m,targetValue:String(m.targetValue),rewardPoints:String(m.rewardPoints)});setEditorOpen(true);setReview(null)}}>{m.title} 수정</button>{m.isActive&&<button type="button" className="secondary-button" disabled={!canEdit} onClick={()=>setReview(m)}>{m.title} 비활성화</button>}</div></li>)}</ul>}
      <div className="list-toolbar"><p>활성 미션은 게임 시작 시 자동 배정됩니다.</p><button type="button" className="primary-button" disabled={!canEdit} onClick={()=>{setEditing(null);setForm(blank());setEditorOpen(true)}}>새 미션 등록</button></div>
      <ActionDialog open={editorOpen} title={editing?'미션 수정':'새 미션 등록'} eyebrow="SECRET MISSION" onClose={()=>{setEditorOpen(false);setEditing(null);setForm(blank())}} busy={busy} dirty={draftDirty}>
      <form className="event-form" noValidate onSubmit={save}><fieldset disabled={!canEdit}>
        <label htmlFor="mission-title">미션 제목</label><input id="mission-title" value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/>
        <label htmlFor="mission-description">미션 설명</label><textarea id="mission-description" rows={3} maxLength={2000} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><p>제목 최대 100자, 설명 최대 2,000자. 줄바꿈 없이 입력하세요.</p>
        <label htmlFor="mission-type">미션 유형</label><select id="mission-type" value={form.missionType} onChange={e=>setForm({...form,missionType:e.target.value,targetValue:e.target.value==='TRADE_BOTH_SIDES'?'2':'1'})}>{Object.entries(missionTypes).map(([type,labels])=><option key={type} value={type}>{labels[0]}</option>)}</select>
        <p>{missionTypes[form.missionType][1]} · {missionTypes[form.missionType][3]} 판정</p>
        <label htmlFor="mission-target">목표 값</label><input id="mission-target" inputMode="numeric" disabled={form.missionType==='TRADE_BOTH_SIDES'} value={form.targetValue} onChange={e=>setForm({...form,targetValue:e.target.value})}/>
        <p>현금 비중은 1~100, 매수·매도 경험은 2, 나머지는 1~1,000의 정수입니다.</p>
        <label htmlFor="mission-reward">완료 보상 포인트</label><input id="mission-reward" inputMode="numeric" value={form.rewardPoints} onChange={e=>setForm({...form,rewardPoints:e.target.value})}/>
        <label className="reset-ack"><input type="checkbox" checked={form.isActive} onChange={e=>setForm({...form,isActive:e.target.checked})}/>활성 미션으로 사용</label>
        <div className="dialog-actions"><button type="button" className="secondary-button" onClick={requestDialogClose}>취소</button><button type="submit" className="primary-button">{editing?'미션 수정 저장':'미션 등록'}</button></div>
      </fieldset></form>
      </ActionDialog>
      <ConfirmDialog open={Boolean(review)} title="미션 비활성화" onCancel={()=>setReview(null)} onConfirm={deactivate} busy={busy} confirmDisabled={!canEdit} confirmLabel="비활성화 확정" danger><p>{review?.title} 미션을 비활성화할까요? 기존 기록은 유지하고 신규 배정에서 제외합니다.</p></ConfirmDialog>
      <MissionAssignments assignments={data.assignments}/>
    </>}
  </Panel>
}
export function MissionAssignments({assignments}) {
  return <section aria-label="참가자 미션 배정 현황"><h3>관리자 전용 참가자 미션 현황</h3><p>진행 중에는 미션 목록 조회를 눌러 최신 진행도를 확인하세요.</p>{!assignments.length?<p>배정된 미션이 없습니다.</p>:<ul className="mission-list">{assignments.map(m=><li key={m.userId}><strong>{m.nickname}</strong><p>{m.title} · {m.progress} / {m.targetValue} {missionTypes[m.missionType][2]}</p><p>{m.status==='COMPLETED'?'완료 · 보상 지급 완료':'진행 중'} · 보상 {m.rewardPoints} P</p></li>)}</ul>}</section>
}
