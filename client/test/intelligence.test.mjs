import assert from 'node:assert/strict'
import { test } from 'node:test'
import { build } from 'esbuild'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { clueInput, validateStore, validateClues, canBuy, privateStoreFailure, intelligenceRequest, intelligenceEnabled } from '../src/intelligence/api.js'
const item = { clueId: 'clue-1', title: '단서', summary: '공개 요약', price: 10, availableRound: 1, canPurchase: true }
const purchase = { ...item, content: '<script>비밀</script>', paidPoints: 10, purchasedAt: '2026-09-18T00:00:00Z' }
const data = { points: 40, items: [item], purchases: [] }
const options = { status: 'RUNNING', stale: false, busy: false }
const form = { title: ' 단서 ', summary: '요약', content: '본문\n두번째 줄', price: '10', availableRound: '1', isActive: true }
const dir = await mkdtemp(join(process.cwd(), '.intelligence-test-'))
let StoreItems, IntelligenceLibrary
try {
 await build({entryPoints:['src/intelligence/IntelligencePanel.jsx'],outfile:join(dir,'panel.mjs'),bundle:true,platform:'node',format:'esm',packages:'external',jsx:'automatic'})
 ;({StoreItems,IntelligenceLibrary}=await import(pathToFileURL(join(dir,'panel.mjs')).href))
} finally { await rm(dir,{recursive:true,force:true}) }
test('intelligence is enabled after backend contract integration',()=>assert.equal(intelligenceEnabled,true))
test('clue fields enforce boundaries and allow multiline private body',()=>{
 assert.equal(clueInput(form).title,'단서')
 for(const patch of [{title:''},{summary:'x'.repeat(501)},{content:'x'.repeat(5001)},{price:'0'},{price:'1e2'},{price:'1000001'},{availableRound:'0'},{availableRound:'1001'},{content:'a\u0000b'},{isActive:'true'}])assert.throws(()=>clueInput({...form,...patch}))
 assert.equal(clueInput({...form,price:'1000000',availableRound:'1000'}).availableRound,1000)
})
test('unowned secrets are discarded; purchased snapshots survive removed catalog items',()=>{
 const safe=validateStore({...data,items:[{...item,content:'LEAK',userId:'OTHER'}]})
 assert.equal(safe.items[0].content,undefined);assert.equal(safe.items[0].userId,undefined)
 assert.equal(validateStore({points:30,items:[],purchases:[purchase]}).purchases[0].content,purchase.content)
 for(const invalid of [{...data,points:-1},{...data,items:[item,item]},{...data,purchases:[{...purchase,purchasedAt:'bad'}]},{...data,purchases:[{...purchase,paidPoints:0}]},{...data,items:[{...item,canPurchase:1}]}])assert.throws(()=>validateStore(invalid))
 assert.doesNotThrow(()=>validateClues({clues:[{...clueInput(form),clueId:'1'}]}))
})
test('buy gate requires current state, sufficient points, eligibility and no ownership',()=>{
 assert.equal(canBuy(data,item,options),true)
 for(const patch of [{status:'WAITING'},{status:'PAUSED'},{status:'FINISHED'},{stale:true},{busy:true}])assert.equal(canBuy(data,item,{...options,...patch}),false)
 assert.equal(canBuy({...data,points:9},item,options),false)
 assert.equal(canBuy({...data,purchases:[purchase]},item,options),false)
 assert.equal(canBuy(data,{...item,canPurchase:false},options),false)
})
test('session expiry and identity changes clear private data',()=>{
 const previous={userId:'one',data}
 assert.equal(privateStoreFailure(previous,'one',new Error('AUTH_REQUIRED')).data,null)
 assert.equal(privateStoreFailure(previous,'two',new Error('NETWORK')).data,null)
 assert.equal(privateStoreFailure(previous,'one',new Error('NETWORK')).data,data)
 assert.equal(privateStoreFailure(previous,'one',new Error('NETWORK')).fresh,false)
})
test('catalog never renders secret content and library escapes HTML',()=>{
 const html=renderToStaticMarkup(createElement(StoreItems,{data:{...data,items:[{...item,content:'HIDDEN'}]},options}))
 assert.doesNotMatch(html,/HIDDEN/)
 const library=renderToStaticMarkup(createElement(IntelligenceLibrary,{purchases:[purchase]}))
 assert.match(library,/&lt;script&gt;/);assert.doesNotMatch(library,/<script>/)
 assert.match(renderToStaticMarkup(createElement(StoreItems,{data:{...data,points:0},options})),/포인트 부족/)
 assert.match(renderToStaticMarkup(createElement(StoreItems,{data:{...data,purchases:[purchase]},options})),/보관함에 있음/)
})
test('purchase sends cookie and expected price only, returns authoritative balance and never retries',async()=>{
 const original=globalThis.fetch
 try {
  globalThis.fetch=async(url,request)=>{
   assert.equal(url,'/api/intelligence/purchases');assert.equal(request.credentials,'include');assert.equal(request.cache,'no-store');assert.equal(request.headers.Authorization,undefined)
   assert.deepEqual(JSON.parse(request.body),{clueId:item.clueId,expectedPrice:10})
   return{ok:true,status:200,json:async()=>({points:30,items:[item],purchases:[purchase]})}
  }
  assert.equal((await intelligenceRequest('/purchases',{method:'POST',body:{clueId:item.clueId,expectedPrice:10}})).points,30)
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('lost response')}
  await assert.rejects(intelligenceRequest('/purchases',{method:'POST',body:{clueId:item.clueId,expectedPrice:10}}));assert.equal(calls,1)
  globalThis.fetch=async()=>({ok:false,status:401,json:async()=>({})})
  await assert.rejects(intelligenceRequest('/me'),/AUTH_REQUIRED/)
  globalThis.fetch=async()=>({ok:false,status:404,json:async()=>{throw new Error('html')}})
  await assert.rejects(intelligenceRequest('/me'),/SERVICE_UNAVAILABLE/)
 }finally{globalThis.fetch=original}
})
test('admin uses bearer and rejects malformed create/delete responses',async()=>{
 const original=globalThis.fetch
 try{
  globalThis.fetch=async(url,request)=>{assert.equal(request.headers.Authorization,'Bearer qa');return {ok:true,status:201,json:async()=>({clue:{...clueInput(form),clueId:'1'}})}}
  await intelligenceRequest('/admin',{method:'POST',password:'qa',body:clueInput(form)})
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({})})
  await assert.rejects(intelligenceRequest('/admin/1',{method:'DELETE',password:'qa'}),/INVALID_RESPONSE/)
  await assert.rejects(intelligenceRequest('/admin',{method:'POST',password:'qa'}),/INVALID_RESPONSE/)
 }finally{globalThis.fetch=original}
})
