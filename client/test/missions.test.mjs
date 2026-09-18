import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { missionInput, validateMine, validateAdmin, missionRequest, canManageMissions, privateFailure } from '../src/missions/api.js'
const dir=await mkdtemp(join(process.cwd(),'.missions-test-'))
let MissionResult,MissionAssignments
try {
 for(const name of ['MissionPanel','MissionManager'])await build({entryPoints:[`src/missions/${name}.jsx`],outfile:join(dir,`${name}.mjs`),bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'})
 ;({MissionResult}=await import(pathToFileURL(join(dir,'MissionPanel.mjs')).href))
 ;({MissionAssignments}=await import(pathToFileURL(join(dir,'MissionManager.mjs')).href))
}finally{await rm(dir,{recursive:true,force:true})}
const form={title:' 미션 ',description:'설명',missionType:'TRADE_BOTH_SIDES',targetValue:'2',rewardPoints:'30',isActive:true}
const mission={...missionInput(form),missionId:'test-id',assignmentCount:1,progress:1,status:'ASSIGNED',assignedAt:'2026-09-18T00:00:00Z',completedAt:null,rewardedAt:null}
test('mission inputs enforce each target range and strict integer rewards',()=>{
 assert.equal(missionInput(form).title,'미션')
 for(const patch of [{targetValue:'1'},{rewardPoints:'0'},{rewardPoints:'1000001'},{targetValue:'1e2'},{description:'a\nb'},{title:'😀'.repeat(101)},{missionType:'CASH_RATIO',targetValue:'101'},{missionType:'CONSECUTIVE_HOLDING',targetValue:'1001'}]) assert.throws(()=>missionInput({...form,...patch}))
 assert.equal(missionInput({...form,title:'😀'.repeat(100)}).title.length,200)
 assert.equal(missionInput({...form,missionType:'CASH_RATIO',targetValue:'100'}).targetValue,100)
})
test('mission mutations require waiting, fresh state and no pending operation',()=>{
 const valid={status:'WAITING',fresh:true}
 assert.equal(canManageMissions(valid),true)
 for(const patch of [{status:'RUNNING'},{status:'PAUSED'},{status:'FINISHED'},{stale:true},{busy:true},{fresh:false}])assert.equal(canManageMissions({...valid,...patch}),false)
})
test('private responses distinguish unassigned from malformed and require confirmed rewards',()=>{
 assert.deepEqual(validateMine({points:0,mission:null}),{points:0,mission:null})
 assert.equal(validateMine({points:0,mission}).mission.progress,1)
 for(const data of [{points:-1,mission:null},{points:0},{points:0,mission:{...mission,progress:-1}},{points:0,mission:{...mission,status:'COMPLETED'}},{points:0,mission:{...mission,missionType:'UNKNOWN'}}]) assert.throws(()=>validateMine(data))
 assert.doesNotThrow(()=>validateAdmin({missions:[mission],assignments:[{...mission,userId:'one',nickname:'참가자'}]}))
 assert.throws(()=>validateAdmin({missions:[mission,mission],assignments:[]}))
})
test('progress is not interpreted as completion and does not invent earned points',()=>{
 const html=renderToStaticMarkup(createElement(MissionResult,{data:{points:0,mission:{...mission,progress:2}},status:'RUNNING'}))
 assert.match(html,/미션 진행 중/);assert.doesNotMatch(html,/보상 지급 완료/)
 const final=renderToStaticMarkup(createElement(MissionResult,{data:{points:30,mission:{...mission,title:'<script>미션</script>',status:'COMPLETED',completedAt:mission.assignedAt,rewardedAt:mission.assignedAt}},status:'FINISHED'}))
 assert.match(final,/보상 지급 완료/);assert.match(final,/30 P/);assert.doesNotMatch(final,/<script>/)
 const ended=renderToStaticMarkup(createElement(MissionResult,{data:{points:0,mission},status:'FINISHED'}));assert.match(ended,/미션 미완료/)
})
test('unassigned state and admin assignment view preserve zero and escape user text',()=>{
 assert.match(renderToStaticMarkup(createElement(MissionResult,{data:{points:0,mission:null},status:'WAITING'})),/활성 미션이 없으면/)
 const html=renderToStaticMarkup(createElement(MissionAssignments,{assignments:[{...mission,userId:'one',nickname:'<script>타인</script>'}]}))
 assert.match(html,/관리자 전용/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/)
})
test('private mission cache is cleared on expiry and never carried between accounts',()=>{
 const previous={userId:'one',data:{points:30,mission}}
 assert.equal(privateFailure(previous,'one',new Error('AUTH_REQUIRED')).data,null)
 assert.equal(privateFailure(previous,'two',new Error('NETWORK')).data,null)
 assert.equal(privateFailure(previous,'one',new Error('NETWORK')).data,previous.data)
})
test('private API uses own-session endpoint, administrator writes use bearer and never retry',async()=>{
 const original=globalThis.fetch
 try{
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/missions/me');assert.equal(options.credentials,'include');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,undefined);return {ok:true,status:200,json:async()=>({points:0,mission:null})}}
 await missionRequest('/me')
 globalThis.fetch=async(url,options)=>{assert.equal(url,'/api/missions/admin');assert.equal(options.headers.Authorization,'Bearer test');assert.equal(options.method,'POST');return{ok:true,status:201,json:async()=>({mission})}}
 await missionRequest('/admin',{password:'test',method:'POST',body:missionInput(form)})
 let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('lost response')}
 await assert.rejects(missionRequest('/admin',{method:'POST'}));assert.equal(calls,1)
 globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({})})
 await assert.rejects(missionRequest('/me'),/AUTH_REQUIRED/)
 }finally{globalThis.fetch=original}
})
