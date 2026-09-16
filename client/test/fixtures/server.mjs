// Development-only contract fixture. Never loaded by the app or production build.
// Run from repository root: node client/test/fixtures/server.mjs
import express from '../../../server/node_modules/express/index.js'
import { Server } from '../../../server/node_modules/socket.io/dist/index.js'
import { createServer } from 'node:http'
import { GameEngine } from '../../../server/src/game-engine.js'
import { createGameRouter } from '../../../server/src/game-routes.js'
const app = express()
const http = createServer(app)
const io = new Server(http, { cors: { origin: 'http://localhost:5173' } })
const game = new GameEngine({ roundDurationMs: 600000, tradingDurationMs: 540000, totalRounds: 12 })
game.on('game-event', ({ name, payload }) => { io.emit(name, payload); io.emit('game:state', payload) })
io.on('connection', (socket) => socket.emit('game:state', game.getSnapshot()))
const companies = [{ companyId: 'A', name: 'A 엔터', currentPrice: 10000 }, { companyId: 'B', name: 'B IT', currentPrice: 20000 }]
let cash = 1000000
const shares = { A: 0, B: 0 }
const orders = new Map()
let dropNext = false
const account = () => ({ cash, holdings: companies.map((c) => ({ ...c, quantity: shares[c.companyId], marketValue: c.currentPrice * shares[c.companyId] })) })
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', 'http://localhost:5173')
  res.set('Access-Control-Allow-Credentials', 'true')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json())
app.get('/api/users/me', (_, res) => res.json({ user: { userId: 'fixture-user', nickname: '테스트 참가자', role: 'USER' } }))
app.use('/api/game', createGameRouter(game, { adminPassword: 'fixture-only', clientUrl: 'http://localhost:5173' }))
app.get('/api/trading/market', (_, res) => res.json({ companies }))
app.get('/api/trading/portfolio', (_, res) => res.json({ account: account() }))
app.post('/fixture/drop-next', (_, res) => { dropNext = true; res.json({ ok: true }) })
app.post('/api/trading/orders', (req, res) => {
  const order = req.body
  const existing = orders.get(order.orderId)
  if (existing) return res.json({ duplicate: true, transaction: existing, account: account() })
  if (!game.getSnapshot().tradingEnabled) return res.status(409).json({ error: 'TRADING_CLOSED' })
  const company = companies.find((c) => c.companyId === order.companyId)
  if (!company || !Number.isSafeInteger(order.quantity) || order.quantity < 1 || order.quantity > 1000000) return res.status(400).json({ error: 'INVALID_INPUT' })
  const totalPrice = company.currentPrice * order.quantity
  if (order.type === 'BUY' && cash < totalPrice) return res.status(409).json({ error: 'INSUFFICIENT_CASH' })
  if (order.type === 'SELL' && shares[order.companyId] < order.quantity) return res.status(409).json({ error: 'INSUFFICIENT_SHARES' })
  cash += order.type === 'BUY' ? -totalPrice : totalPrice
  shares[order.companyId] += order.type === 'BUY' ? order.quantity : -order.quantity
  const transaction = { ...order, transactionId: order.orderId, price: company.currentPrice, totalPrice, createdAt: new Date().toISOString() }
  orders.set(order.orderId, transaction)
  if (dropNext) { dropNext = false; return res.status(503).json({ error: 'SERVICE_UNAVAILABLE' }) }
  res.status(201).json({ duplicate: false, transaction, account: account() })
})
http.listen(3100, '127.0.0.1', () => console.log('Fixture: 3100; admin password fixture-only; no database or real accounts'))
