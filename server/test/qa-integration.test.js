import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { io } from 'socket.io-client'

// Exercise the production entry point, including its real post-commit hooks.
test('stage 11: concurrent HTTP orders, process crash recovery, events and final reset', {
  skip: !process.env.TEST_DATABASE_URL && 'Set TEST_DATABASE_URL to run integration QA', timeout: 60000,
}, async t => {
  const schema = `test_qa_${randomUUID().replaceAll('-', '')}`
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL })
  await admin.query(`CREATE SCHEMA "${schema}"`)
  const databaseUrl = new URL(process.env.TEST_DATABASE_URL)
  databaseUrl.searchParams.set('options', `-c search_path=${schema}`)
  const database = new pg.Pool({ connectionString: databaseUrl.href })
  let processHandle, base, errors = ''
  const sockets = []
  async function stop() {
    if (processHandle && processHandle.exitCode === null && processHandle.signalCode === null) {
      const exited = once(processHandle, 'exit'); processHandle.kill('SIGKILL'); await exited
    }
  }
  t.after(async () => {
    sockets.forEach(socket => socket.disconnect())
    await stop(); await database.end()
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end()
  })
  await database.query(await readFile(new URL('../src/schema.sql', import.meta.url), 'utf8'))
  async function start() {
    processHandle = spawn(process.execPath, [fileURLToPath(new URL('../src/server.js', import.meta.url))], {
      env: { ...process.env, DATABASE_URL: databaseUrl.href, PORT: '0', ADMIN_PASSWORD: 'qa-only',
        CLIENT_URL: 'http://localhost:5173', NODE_ENV: 'test', GAME_TOTAL_ROUNDS: '1',
        GAME_ROUND_DURATION_MS: '70000', GAME_TRADING_DURATION_MS: '60000', EVENT_HALT_DURATION_MS: '1000' },
      stdio: ['ignore','pipe','pipe'],
    })
    processHandle.stderr.on('data', chunk => { errors += chunk })
    const port = await new Promise((resolve, reject) => {
      let output = ''
      const timeout = setTimeout(() => reject(new Error('QA server startup timeout')), 10000)
      processHandle.once('error', error => { clearTimeout(timeout); reject(error) })
      processHandle.once('exit', () => { clearTimeout(timeout); reject(new Error('QA server exited before ready')) })
      processHandle.stdout.on('data', chunk => {
        output += chunk
        const match = output.match(/running on port (\d+)/)
        if (match) { clearTimeout(timeout); resolve(Number(match[1])) }
      })
    })
    base = `http://127.0.0.1:${port}`
  }
  async function request(path, { body, cookie, method, admin: privileged = false } = {}) {
    const response = await fetch(base + '/api' + path, { method: method || (body ? 'POST' : 'GET'),
      signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}), ...(privileged ? { Authorization: 'Bearer qa-only' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] }
  }
  const control = action => request(`/game/admin/${action}`, { method: 'POST', admin: true })
  const feed = async () => (await request('/broadcast')).body
  await start()
  const participants = await Promise.all(Array.from({length:12}, (_, index) => request('/users/join', {body:{nickname:`qa-${index}`,pin:'1234'}})))
  assert.ok(participants.every(p => p.status === 201))
  assert.equal((await feed()).ranking.totalParticipants, 12)
  const events = []
  for (const rate of [10,-10,5]) {
    const response = await request('/events/admin', {admin:true,body:{title:`event ${rate}`,news:'news',result:'result',effects:[{companyId:'A',changeRate:rate}]}})
    assert.equal(response.status,201); events.push(response.body.event.eventId)
  }
  assert.equal((await request('/events/admin/schedule', {admin:true,method:'PUT',body:{rounds:[{round:1,events:[
    {eventId:events[0],triggerPhase:'INTRADAY',triggerOffsetSeconds:10},
    {eventId:events[1],triggerPhase:'INTRADAY',triggerOffsetSeconds:20},
    {eventId:events[2],triggerPhase:'CLOSE'},
  ]}]}})).status,200)
  assert.equal((await control('start')).status,200)
  await feed() // Wait for the server's start-event queue.
  const orders = participants.map(() => ({orderId:randomUUID(),companyId:'A',type:'BUY',quantity:1}))
  const responses = await Promise.all(participants.flatMap((p,i) => [0,1].map(() => request('/trading/orders',{cookie:p.cookie,body:orders[i]}))))
  assert.equal(responses.filter(r=>r.status===201).length,12)
  assert.equal(responses.filter(r=>r.status===200 && r.body.duplicate).length,12)
  const overspend = await Promise.all([0,1,2].map(() => request('/trading/orders',{cookie:participants[0].cookie,body:{orderId:randomUUID(),companyId:'A',type:'BUY',quantity:60}})))
  assert.equal(overspend.filter(r=>r.status===201).length,1)
  assert.equal(overspend.filter(r=>r.body.error==='INSUFFICIENT_CASH').length,2)
  const before = (await request('/trading/portfolio',{cookie:participants[0].cookie})).body
  assert.equal(before.account.cash,390000)
  assert.equal((await control('pause')).status,200)
  const paused = await feed()
  await stop(); await start()
  const restored = await feed()
  assert.equal(restored.game.status,'PAUSED'); assert.equal(restored.game.remainingSeconds,paused.game.remainingSeconds)
  assert.deepEqual((await request('/trading/portfolio',{cookie:participants[0].cookie})).body.account,before.account)
  const socket = io(base,{path:'/api/socket.io',autoConnect:false,reconnection:false,extraHeaders:{Cookie:participants[0].cookie}})
  sockets.push(socket)
  const state = once(socket,'game:state',{signal:AbortSignal.timeout(5000)}); socket.connect()
  assert.equal((await state)[0].status,'PAUSED'); socket.disconnect()
  assert.equal((await control('resume')).status,200); await feed(); await stop()
  // Simulate downtime with both intraday deadlines elapsed, while trading remains open.
  await database.query("UPDATE games SET round_started_at=NOW()-INTERVAL '25 seconds',phase_ends_at=NOW()+INTERVAL '35 seconds'")
  await start()
  assert.equal((await feed()).market[0].currentPrice,9900)
  const replay = await request('/trading/orders',{cookie:participants[0].cookie,body:orders[0]})
  assert.equal(replay.status,200); assert.equal(replay.body.duplicate,true)
  assert.equal(replay.body.transaction.price,10000)
  await stop(); await start()
  assert.equal((await feed()).market[0].currentPrice,9900)
  assert.equal((await database.query('SELECT count(*)::int AS n FROM stock_price_changes')).rows[0].n,2)
  await stop()
  await database.query("UPDATE games SET round_started_at=NOW()-INTERVAL '80 seconds',phase_ends_at=NOW()-INTERVAL '20 seconds'")
  await start()
  const final = await feed()
  assert.equal(final.game.status,'FINISHED'); assert.equal(final.ranking.final,true)
  assert.equal(final.market[0].currentPrice,10395)
  assert.equal(final.results.length,3)
  assert.equal((await database.query('SELECT count(*)::int AS n FROM transactions')).rows[0].n,13)
  await stop(); await start()
  assert.deepEqual((await feed()).ranking,final.ranking)
  assert.equal((await database.query('SELECT count(*)::int AS n FROM stock_price_changes')).rows[0].n,3)
  assert.equal((await control('reset')).status,200)
  const reset = await feed(); assert.equal(reset.game.status,'WAITING'); assert.equal(reset.ranking.totalParticipants,0)
  assert.equal((await request('/trading/portfolio',{cookie:participants[0].cookie})).status,401)
  // Live timer/Socket flow after reset: new orders must be rejected during the halt.
  const nextUser = await request('/users/join',{body:{nickname:'next-game',pin:'1234'}})
  assert.equal((await request('/events/admin/schedule',{admin:true,method:'PUT',body:{rounds:[{round:1,events:[
    {eventId:events[0],triggerPhase:'INTRADAY',triggerOffsetSeconds:2},
    {eventId:events[1],triggerPhase:'CLOSE'}, {eventId:events[2],triggerPhase:'CLOSE'},
  ]}]}})).status,200)
  const live = io(base,{path:'/api/socket.io',autoConnect:false,reconnection:false})
  sockets.push(live)
  const connected = once(live,'connect',{signal:AbortSignal.timeout(5000)}); live.connect(); await connected
  const halt = once(live,'trading:halt',{signal:AbortSignal.timeout(10000)})
  const resumed = once(live,'trading:resume',{signal:AbortSignal.timeout(10000)})
  const breaking = once(live,'market:event:breaking',{signal:AbortSignal.timeout(10000)})
  assert.equal((await control('start')).status,200)
  await halt
  const blocked = await request('/trading/orders',{cookie:nextUser.cookie,body:{orderId:randomUUID(),companyId:'A',type:'BUY',quantity:1}})
  assert.equal(blocked.status,409); assert.equal(blocked.body.error,'MARKET_HALTED')
  assert.equal((await breaking)[0].changes[0].newPrice,11000)
  await resumed
  assert.equal((await request('/trading/orders',{cookie:nextUser.cookie,body:{orderId:randomUUID(),companyId:'A',type:'BUY',quantity:1}})).status,201)
  live.disconnect()
  assert.equal(errors,'','production entry point must not log failed persistence or hooks')
})
