import { test } from 'node:test'
import assert from 'node:assert/strict'
import { eligibleEvents, scheduleDraft, scheduleInput, validateConstraints } from '../src/events/schedule.js'
import { eventRequest } from '../src/events/api.js'
const limits = { totalRounds: 2, tradingDurationMs: 60000, haltDurationMs: 3000 }
const events = ['a','b','c','d','e','f'].map(eventId => ({ eventId, effects: [{companyId:'A',changeRate:10}] }))
const row = { eventId:'a', round:'1', displayOrder:'1', triggerPhase:'INTRADAY', triggerOffsetSeconds:'10', preannounceSeconds:'2' }
test('manual schedule handles multiple events and empty rounds without sending close timing', () => {
  const body = scheduleInput([row, {...row,eventId:'b',displayOrder:'2',triggerPhase:'CLOSE'}], limits, events)
  assert.equal(body.rounds[0].events.length, 2)
  assert.deepEqual(body.rounds[0].events[1], {eventId:'b',displayOrder:2,triggerPhase:'CLOSE'})
  assert.deepEqual(scheduleInput([],limits,events), {rounds:[]})
  assert.equal(scheduleDraft([{...row,triggerOffsetSeconds:null}])[0].triggerOffsetSeconds,'')
})
test('schedule rejects duplicated events, display order, invalid timing and unavailable companies', () => {
  for (const change of [{round:'3'},{round:'0'},{displayOrder:'0'},{triggerOffsetSeconds:'57'},{triggerOffsetSeconds:'1.5'},{preannounceSeconds:'10'},{eventId:'missing'}]) assert.throws(()=>scheduleInput([{...row,...change}],limits,events))
  assert.throws(()=>scheduleInput([row,{...row,round:'2'}],limits,events), /DUPLICATE_EVENT_ASSIGNMENT/)
  assert.throws(()=>scheduleInput([row,{...row,eventId:'b'}],limits,events), /INVALID_EVENT_SCHEDULE/)
  assert.equal(eligibleEvents(events,[{companyId:'A',isActive:false}]).length,0)
  assert.throws(()=>validateConstraints({...limits,haltDurationMs:undefined}), /INVALID_RESPONSE/)
})
test('overlap validation uses server halt duration and permits exactly adjacent windows', () => {
  const second = {...row,eventId:'b',displayOrder:'2',triggerOffsetSeconds:'15'}
  assert.doesNotThrow(()=>scheduleInput([row,second],limits,events))
  assert.throws(()=>scheduleInput([row,{...second,triggerOffsetSeconds:'14'}],limits,events), /EVENT_SCHEDULE_CONFLICT/)
  assert.throws(()=>scheduleInput([row,second],{...limits,haltDurationMs:4000},events), /EVENT_SCHEDULE_CONFLICT/)
})
test('schedule API sends authenticated full replacement and rejects malformed success without retrying', async () => {
  const before = globalThis.fetch
  try {
    let calls=0
    globalThis.fetch=async(url,options)=>{calls++;assert.equal(url,'/api/events/admin/schedule');assert.equal(options.method,'PUT');assert.equal(options.headers.Authorization,'Bearer qa');assert.deepEqual(JSON.parse(options.body),{rounds:[]});return {ok:true,status:200,json:async()=>({schedule:[]})}}
    assert.deepEqual(await eventRequest('/admin/schedule',{password:'qa',method:'PUT',body:{rounds:[]}}),{schedule:[]})
    assert.equal(calls,1)
    globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({schedule:[{}]})})
    await assert.rejects(eventRequest('/admin/schedule'), /INVALID_RESPONSE/)
  } finally { globalThis.fetch=before }
})
