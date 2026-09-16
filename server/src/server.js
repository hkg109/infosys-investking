import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import './config.js'
import { pool } from './db.js'
import { createEventRouter } from './event-routes.js'
import { createEventCoordinator } from './events.js'
import { GameEngine } from './game-engine.js'
import { createGameRouter } from './game-routes.js'
import { loadGameState, saveGameState } from './game-store.js'
import { createRankingRouter } from './ranking-routes.js'
import { createRankingCoordinator } from './rankings.js'
import { createUserRouter } from './users.js'
import { createTradingRouter } from './trading.js'

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

const app = express()
const port = process.env.PORT || 3000
const httpServer = createServer(app)
const gameDefaults = {
  totalRounds: positiveInteger(process.env.GAME_TOTAL_ROUNDS, 12, 'GAME_TOTAL_ROUNDS'),
  roundDurationMs: positiveInteger(process.env.GAME_ROUND_DURATION_MS, 10 * 60 * 1000, 'GAME_ROUND_DURATION_MS'),
  tradingDurationMs: positiveInteger(process.env.GAME_TRADING_DURATION_MS, 9 * 60 * 1000, 'GAME_TRADING_DURATION_MS'),
}
let initialGameState = null
if (pool) {
  try {
    initialGameState = await loadGameState(pool, gameDefaults)
  } catch (error) {
    // A freshly checked-out server may start before the explicit migration command.
    if (error.code !== '42P01') console.error('Failed to restore game state from PostgreSQL')
  }
}
const game = new GameEngine({ ...gameDefaults, initialState: initialGameState })
const reportGamePersistenceError = (error) => {
  if (error.code !== '42P01') console.error('Failed to persist game state')
}
let gamePersistence = saveGameState(pool, game.getSnapshot()).catch(reportGamePersistenceError)
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
})
const eventCoordinator = createEventCoordinator(pool, io)
const initialCash = positiveInteger(process.env.INITIAL_CASH, 1_000_000, 'INITIAL_CASH')
const rankingCoordinator = createRankingCoordinator(pool, io, { initialCash })
try {
  await eventCoordinator.reconcile(game.getSnapshot())
  await rankingCoordinator.reconcile(game.getSnapshot())
} catch (error) {
  if (error.code !== '42P01') console.error('Failed to reconcile game state')
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)
  socket.emit('game:state', game.getSnapshot())

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`)
  })
})

let eventProcessing = Promise.resolve()
game.on('game-event', (event) => {
  const { name, payload } = event
  io.emit(name, payload)
  io.emit('game:state', payload)
  gamePersistence = gamePersistence.then(() => saveGameState(pool, payload)).catch(reportGamePersistenceError)
  const persistenceForEvent = gamePersistence
  eventProcessing = eventProcessing.then(async () => {
    await persistenceForEvent
    await eventCoordinator.handleGameEvent(event)
    await rankingCoordinator.handleGameEvent(event)
  }).catch((error) => {
    if (error.code !== '42P01') console.error('Failed to process game event')
  })
})

app.use(express.json({ limit: '8kb' }))
app.use('/api/users', createUserRouter(pool, {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  secureCookies: process.env.NODE_ENV === 'production',
  onUserCreated: async () => {
    await eventProcessing
    return rankingCoordinator.refreshAndEmit({ final: game.getSnapshot().status === 'FINISHED' })
  },
}))
app.use('/api/game', createGameRouter(game, {
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  beforeStart: (snapshot) => eventCoordinator.prepareGameStart(snapshot),
}))
app.use('/api/events', createEventRouter(pool, game, {
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
}))
app.use('/api/trading', createTradingRouter(pool, game, {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  initialCash,
  onTradeCommitted: () => rankingCoordinator.refreshAndEmit(),
}))
app.use('/api/rankings', createRankingRouter(pool, game, {
  beforeRefresh: () => eventProcessing,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  adminPassword: process.env.ADMIN_PASSWORD,
  initialCash,
}))

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

app.use((error, _request, response, _next) => {
  if (error.type === 'entity.parse.failed') return response.status(400).json({ error: 'INVALID_JSON' })
  if (error.type === 'entity.too.large') return response.status(413).json({ error: 'PAYLOAD_TOO_LARGE' })
  // Never log request bodies, PINs, connection strings, or database error details.
  console.error('API request failed')
  response.status(503).json({ error: 'SERVICE_UNAVAILABLE' })
})

httpServer.listen(port, () => {
  console.log(`Infosys InvestKing server is running on port ${httpServer.address().port}`)
})
