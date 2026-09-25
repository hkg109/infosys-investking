import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import express from 'express'
import pg from 'pg'
import '../src/config.js'
import { ACTIVE_GAME_ID, loadGameState } from '../src/game-store.js'
import { createIntelligenceRouter } from '../src/intelligence-routes.js'
import { validateClue, saveClue, purchaseClue, getIntelligence } from '../src/intelligence.js'
import { digestSessionToken, SESSION_COOKIE_NAME } from '../src/session-auth.js'
import { createGameResetCoordinator } from '../src/game-reset.js'
const dbOptions = { skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL for PostgreSQL integration tests', timeout: 30000 }
const input = { title: '수요 단서', summary: '공개 요약', content: '구매자 전용 비밀\n다음 줄', price: 10, availableRound: 1, isActive: true }
const clientUrl = 'http://localhost:5173'
async function setup(t) {
  const schema = `test_intelligence_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  await admin.query(`CREATE SCHEMA "${schema}"`)
  const database = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` })
  t.after(async () => { await database.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end() })
  const sql = await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8')
  await database.query(sql); await database.query(sql)
  await loadGameState(database, { totalRounds: 4, roundDurationMs: 70000, tradingDurationMs: 60000 })
  let snapshot = { status: 'WAITING', currentRound: 0, totalRounds: 4, phase: 'WAITING' }
  const engine = { getSnapshot: () => snapshot, reset: () => (snapshot = { ...snapshot, status: 'WAITING', currentRound: 0 }) }
  async function state(status, round = 1) {
    snapshot = { ...snapshot, status, currentRound: round, phase: status === 'RUNNING' ? 'TRADING' : status }
    await database.query('UPDATE games SET status=$2,current_round=$3 WHERE id=$1', [ACTIVE_GAME_ID, status, round])
  }
  async function user(cash = 100) {
    const id = randomUUID(), token = randomBytes(32).toString('hex')
    await database.query("INSERT INTO users(id,nickname,pin_hash) VALUES($1,$2,'test')", [id,id.slice(0,20)])
    await database.query("INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')", [digestSessionToken(token),id])
    await database.query('INSERT INTO wallets(game_id,user_id,cash) VALUES($1,$2,$3)', [ACTIVE_GAME_ID,id,cash])
    return { id, token, cookie: `${SESSION_COOKIE_NAME}=${token}` }
  }
  const app = express(); app.use(express.json({ limit: '32kb' }))
  app.use('/api/intelligence', createIntelligenceRouter(database, engine, { adminPassword: 'test-admin', clientUrl, initialCash: 100 }))
  app.use((_error,_req,res,_next) => res.status(503).json({ error: 'SERVICE_UNAVAILABLE' }))
  const server = app.listen(0,'127.0.0.1'); await once(server,'listening')
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections() }))
  const base = `http://127.0.0.1:${server.address().port}/api/intelligence`
  const request = (path, { method='GET', body, who, admin: isAdmin=false, origin }={}) => fetch(base+path, {method,headers:{'Content-Type':'application/json',...(who?{Cookie:who.cookie}:{}),...(isAdmin?{Authorization:'Bearer test-admin'}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const create = async patch => (await saveClue(database,engine,null,{...input,...patch})).clue
  const buy = (who, clue, price=clue.price) => purchaseClue(database,engine,who.id,{clueId:clue.clueId,expectedPrice:price})
  return { database,engine,state,user,request,create,buy,setLive: patch => { snapshot={...snapshot,...patch} } }
}
test('intelligence input enforces type, Unicode, integer and round limits',()=>{
  assert.equal(validateClue(input,4).content,input.content)
  for(const patch of [{price:0},{price:'10'},{price:1000001},{availableRound:5},{availableRound:1.5},{isActive:'true'},{title:'x'.repeat(101)},{summary:'x'.repeat(501)},{content:'x'.repeat(5001)},{content:'a\u0000b'},{summary:'a\nb'}])assert.throws(()=>validateClue({...input,...patch},4),/INVALID_CLUE/)
  assert.equal(validateClue({...input,content:'한'.repeat(5000)},4).content.length,5000)
})
test('intelligence HTTP: admin CRUD, auth/origin, round filtering and no public content',dbOptions,async t=>{
  const c=await setup(t), who=await c.user(40)
  assert.equal((await c.request('/admin')).status,401)
  assert.equal((await c.request('/me')).status,401)
  assert.equal((await c.request('/me',{who,origin:'https://evil.test'})).status,403)
  const preflight=await c.request('/purchases',{method:'OPTIONS',origin:clientUrl});assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'),'true')
  const created=await c.request('/admin',{method:'POST',admin:true,body:{...input,content:'한'.repeat(5000)}})
  assert.equal(created.status,201);const clue=(await created.json()).clue
  assert.equal((await c.request(`/admin/${clue.clueId}`,{method:'PUT',admin:true,body:input})).status,200)
  await c.create({title:'미래 단서',availableRound:2}); const inactive=await c.create({title:'비활성 단서'})
  assert.equal((await c.request(`/admin/${inactive.clueId}`,{method:'DELETE',admin:true})).status,204)
  assert.equal((await c.request('/admin/not-uuid',{method:'DELETE',admin:true})).status,400)
  assert.equal((await c.request(`/admin/${randomUUID()}`,{method:'PUT',admin:true,body:input})).status,404)
  assert.equal((await c.request('/admin',{method:'POST',admin:true,body:{...input,availableRound:5}})).status,400)
  await c.state('RUNNING')
  const response=await c.request('/me',{who,origin:clientUrl}), data=await response.json()
  assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Access-Control-Allow-Origin'),clientUrl)
  assert.equal(data.items.length,1);assert.equal(data.items[0].content,undefined);assert.deepEqual(data.purchases,[])
  assert.equal(JSON.stringify(data).includes(input.content),false)
  for(const method of ['POST','PUT','DELETE']) assert.equal((await c.request(method==='POST'?'/admin':`/admin/${clue.clueId}`,{method,admin:true,body:input})).status,409)
  assert.equal((await c.request('/purchases',{method:'POST',body:{clueId:clue.clueId,expectedPrice:10}})).status,401)
})
test('intelligence concurrent duplicate/different purchases serialize cash wallet without overspending',dbOptions,async t=>{
  const c=await setup(t), who=await c.user(20), clue=await c.create(), second=await c.create({title:'다른 단서',price:15})
  await c.state('RUNNING')
  const results=await Promise.all(Array.from({length:8},()=>c.buy(who,clue)))
  assert.ok(results.every(r=>r.cash===10 && r.purchases.length===1))
  assert.equal((await c.database.query('SELECT count(*)::int AS n FROM intelligence_purchases')).rows[0].n,1)
  await assert.rejects(c.buy(who,second),/INSUFFICIENT_CASH/)
  const other=await c.user(20)
  const raced=await Promise.allSettled([c.buy(other,clue),c.buy(other,second)])
  assert.equal(raced.filter(r=>r.status==='fulfilled').length,1)
  const mine=await getIntelligence(c.database,c.engine,other.id,100);assert.equal(mine.purchases.length,1);assert.ok([5,10].includes(mine.cash))
  await c.state('FINISHED')
  const retry=await c.buy(who,clue,999);assert.equal(retry.cash,10);assert.equal(retry.purchases.length,1)
})
test('intelligence purchase rejects unavailable/changed/closed conditions without changing cash',dbOptions,async t=>{
  const c=await setup(t), who=await c.user(40), clue=await c.create(), future=await c.create({availableRound:2}), inactive=await c.create({isActive:false})
  await c.state('RUNNING')
  await assert.rejects(c.buy(who,clue,11),/PRICE_CHANGED/)
  for(const unavailable of [future,inactive,{clueId:randomUUID(),price:10}])await assert.rejects(c.buy(who,unavailable),/CLUE_UNAVAILABLE/)
  for(const status of ['WAITING','PAUSED','FINISHED']){await c.state(status);await assert.rejects(c.buy(who,clue),/PURCHASE_CLOSED/)}
  await c.state('RUNNING');c.setLive({status:'PAUSED'})
  await assert.rejects(c.buy(who,clue),/PURCHASE_CLOSED/)
  assert.equal((await getIntelligence(c.database,c.engine,who.id,100)).cash,40)
  c.setLive({status:'RUNNING',phase:'RESULT'}) // Closing phase remains eligible while RUNNING.
  assert.equal((await c.buy(who,clue)).cash,30)
})
test('intelligence private history restores with a new session and preserves purchase snapshots',dbOptions,async t=>{
  const c=await setup(t), who=await c.user(40), other=await c.user(40), clue=await c.create()
  await c.state('RUNNING');await c.buy(who,clue)
  const stolen=await c.request(`/me?userId=${who.id}`,{who:other});const publicData=await stolen.json()
  assert.deepEqual(publicData.purchases,[]);assert.equal(JSON.stringify(publicData).includes('구매자 전용 비밀'),false)
  const own=await c.request('/purchases',{method:'POST',who:other,body:{clueId:clue.clueId,expectedPrice:10,userId:who.id}})
  assert.equal(own.status,200);assert.equal((await own.json()).cash,30) // Always charges authenticated caller.
  const newToken=randomBytes(32).toString('hex')
  await c.database.query('DELETE FROM user_sessions WHERE user_id=$1',[who.id])
  assert.equal((await c.request('/me',{who})).status,401)
  await c.database.query("INSERT INTO user_sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '1 hour')",[digestSessionToken(newToken),who.id])
  who.cookie=`${SESSION_COOKIE_NAME}=${newToken}`
  const recovered=await (await c.request('/me',{who})).json();assert.equal(recovered.cash,30);assert.equal(recovered.purchases[0].content,input.content)
  // Simulate a later catalog edit while keeping purchase history; normal HTTP edits require WAITING.
  await c.database.query("UPDATE intelligence_clues SET title='변경 제목',content='변경 본문',price=99,is_active=FALSE WHERE id=$1",[clue.clueId])
  const snapshot=await (await c.request('/me',{who})).json();assert.equal(snapshot.items.length,0);assert.equal(snapshot.purchases[0].content,input.content);assert.equal(snapshot.purchases[0].paidCash,10)
})
test('intelligence rolls back cash wallet on purchase record failure',dbOptions,async t=>{
  const c=await setup(t), who=await c.user(40), clue=await c.create()
  await c.state('RUNNING')
  await c.database.query("CREATE FUNCTION reject_purchase() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$ LANGUAGE plpgsql")
  await c.database.query('CREATE TRIGGER reject_purchase BEFORE INSERT ON intelligence_purchases FOR EACH ROW EXECUTE FUNCTION reject_purchase()')
  await assert.rejects(c.buy(who,clue),/test rollback/)
  assert.equal((await getIntelligence(c.database,c.engine,who.id,100)).cash,40)
  await c.database.query('DROP TRIGGER reject_purchase ON intelligence_purchases')
  assert.equal((await c.buy(who,clue)).cash,30)
})
test('intelligence purchases disappear on game reset while clue originals remain',dbOptions,async t=>{
  const c=await setup(t), who=await c.user(40), clue=await c.create()
  await c.state('RUNNING');await c.buy(who,clue);await c.state('FINISHED')
  await createGameResetCoordinator(c.database,c.engine).reset()
  assert.equal((await c.database.query('SELECT count(*)::int n FROM intelligence_purchases')).rows[0].n,0)
  assert.equal((await c.database.query('SELECT count(*)::int n FROM wallets')).rows[0].n,0)
  assert.equal((await c.database.query('SELECT count(*)::int n FROM intelligence_clues')).rows[0].n,1)
  assert.equal((await c.request('/me',{who})).status,401)
  await assert.rejects(c.buy(who,clue),/AUTH_REQUIRED/)
})

test('intelligence rolls back if game pauses during purchase or starts during clue editing',dbOptions,async t=>{
  const c=await setup(t), who=await c.user(40), clue=await c.create()
  await c.state('RUNNING')
  const intercept = (pattern, callback) => ({ connect: async () => {
    const client=await c.database.connect()
    return { release:()=>client.release(), query:async(...args)=>{
      const result=await client.query(...args)
      if (pattern.test(args[0])) callback()
      return result
    } }
  } })
  const pauseDuringInsert=intercept(/INSERT INTO intelligence_purchases/,()=>c.setLive({status:'PAUSED'}))
  await assert.rejects(purchaseClue(pauseDuringInsert,c.engine,who.id,{clueId:clue.clueId,expectedPrice:10}),/PURCHASE_CLOSED/)
  let mine=await getIntelligence(c.database,c.engine,who.id,100);assert.equal(mine.cash,40);assert.equal(mine.purchases.length,0)
  await c.state('WAITING',0)
  const startDuringEdit=intercept(/UPDATE intelligence_clues SET title/,()=>c.setLive({status:'RUNNING',currentRound:1}))
  await assert.rejects(saveClue(startDuringEdit,c.engine,clue.clueId,{...input,content:'변경'}),/CLUE_MANAGEMENT_CLOSED/)
  assert.equal((await c.database.query('SELECT content FROM intelligence_clues WHERE id=$1',[clue.clueId])).rows[0].content,input.content)
})


test('real PostgreSQL HTTP responses expose cash and recover a lost purchase response',dbOptions,async t=>{
  const c=await setup(t), who=await c.user(40), other=await c.user(0)
  const createdResponse=await c.request('/admin',{method:'POST',admin:true,body:input})
  assert.equal(createdResponse.status,201)
  const created=(await createdResponse.json()).clue
  assert.equal(created.content,input.content)
  await c.state('RUNNING')
  const before=await (await c.request('/me',{who})).json()
  assert.equal(before.cash,40);assert.equal(before.items[0].content,undefined)
  // A client may lose the response after the server commits. GET restores the
  // authoritative balance and private purchase without repeating the charge.
  const purchased=await c.request('/purchases',{method:'POST',who,body:{clueId:created.clueId,expectedPrice:10}})
  assert.equal(purchased.status,200)
  const recovered=await (await c.request('/me',{who})).json()
  assert.equal(recovered.cash,30);assert.equal(recovered.purchases[0].content,input.content)
  assert.equal(recovered.purchases[0].paidCash,10)
  const separate=await (await c.request('/me',{who:other})).json()
  assert.equal(separate.cash,0);assert.deepEqual(separate.purchases,[])
  const insufficient=await c.request('/purchases',{method:'POST',who:other,body:{clueId:created.clueId,expectedPrice:10}})
  assert.equal(insufficient.status,409);assert.equal((await insufficient.json()).error,'INSUFFICIENT_CASH')
  await c.database.query('DELETE FROM user_sessions WHERE user_id=$1',[other.id])
  assert.equal((await c.request('/me',{who:other})).status,401)
})
