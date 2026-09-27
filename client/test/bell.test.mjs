import {test} from 'node:test'
import assert from 'node:assert/strict'
import {playSound,unlockSounds} from '../src/audio/soundEffects.js'
test('event sound rings three times and respects mute and audio unlock',async()=>{
 const starts=[]
 const previous=globalThis.window
 class FakeAudio {
  currentTime=0;destination={}
  resume(){return Promise.resolve()}
  createOscillator(){return {frequency:{setValueAtTime(){}},connect(){return {connect(){}}},start(t){starts.push(t)},stop(){}}}
  createGain(){return {gain:{setValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){}}}
 }
 globalThis.window={AudioContext:FakeAudio}
 try{
  playSound('breaking');assert.equal(starts.length,0)
  unlockSounds();await Promise.resolve()
  playSound('breaking',true);assert.equal(starts.length,0)
  playSound('breaking');assert.equal(starts.length,3)
  assert.ok(starts[1]>starts[0]+.36);assert.ok(starts[2]>starts[1]+.36)
 }finally{globalThis.window=previous}
})
