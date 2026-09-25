import { createBroadcastRouter } from './broadcast.js'
import { createIntelligenceRouter } from './intelligence-routes.js'
import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import './config.js'
import { createAdminAuthRouter } from './admin-auth.js'
import { createAdminRouter } from './admin-routes.js'
import { createCompanyRouter } from './company-routes.js'
import { pool } from './db.js'
import { createEventRouter } from './event-routes.js'
import { createEventCoordinator } from './events.js'
import { GameEngine } from './game-engine.js'
import { createGameResetCoordinator } from './game-reset.js'
import { createGameRouter } from './game-routes.js'
import { loadGameState, saveGameState } from './game-store.js'
import { createMarketGate } from './market-gate.js'
import { createMarketHistoryCoordinator } from './market-history.js'
import { createRankingRouter } from './ranking-routes.js'
import { createRankingCoordinator } from './rankings.js'
import { createUserRouter } from './users.js'
import { createTradingRouter } from './trading.js'
import { createPresenceTracker, createSocketSessionMiddleware } from './socket-presence.js'

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
  path: '/api/socket.io',
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true },
})
io.use(createSocketSessionMiddleware(pool))
const presence = createPresenceTracker(io)
const resetCoordinator = createGameResetCoordinator(pool, game, {
  onReset: () => presence.disconnectAll(),
})
const initialCash = positiveInteger(process.env.INITIAL_CASH, 1_000_000, 'INITIAL_CASH')
const rankingCoordinator = createRankingCoordinator(pool, io, {
  initialCash,
  viewerIds: () => presence.userIds(),
})
const marketGate = createMarketGate()
const marketHistoryCoordinator = createMarketHistoryCoordinator(pool)
const eventHaltDurationMs = positiveInteger(process.env.EVENT_HALT_DURATION_MS, 3_000, 'EVENT_HALT_DURATION_MS')
const eventCoordinator = createEventCoordinator(pool, io, {
  marketGate,
  getGameSnapshot: () => game.getSnapshot(),
  onPricesChanged: () => rankingCoordinator.refreshAndEmit(),
  haltDurationMs: eventHaltDurationMs,
})
try {
  const restoredGame = game.getSnapshot()
  await marketHistoryCoordinator.reconcileBeforeEvents(restoredGame)
  await eventCoordinator.reconcile(restoredGame)
  await marketHistoryCoordinator.reconcileAfterEvents(restoredGame)
  await rankingCoordinator.reconcile(game.getSnapshot())
} catch (error) {
  if (error.code !== '42P01') console.error('Failed to reconcile game state')
}

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)
  presence.connect(socket)
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
    await marketHistoryCoordinator.beforeGameEvent(event)
    await eventCoordinator.handleGameEvent(event)
    await marketHistoryCoordinator.afterGameEvent(event)
    await rankingCoordinator.handleGameEvent(event)
  }).catch((error) => {
    if (error.code !== '42P01') console.error('Failed to process game event')
  })
})

// Intelligence bodies allow 5,000 Unicode characters plus title/summary.
app.use(express.json({ limit: '32kb' }))
app.use(resetCoordinator.blockMutations)
app.use('/api/admin/auth', createAdminAuthRouter({
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
}))
app.use('/api/admin', createAdminRouter(pool, {
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  presence,
  initialCash,
  engine: game,
  onAssetsAdjusted: () => rankingCoordinator.refreshAndEmit(),
}))
app.use('/api/companies', createCompanyRouter(pool, game, {
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
}))
app.use('/api/users', createUserRouter(pool, {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  secureCookies: process.env.NODE_ENV === 'production',
  onUserCreated: async (user) => {
    await eventProcessing
    return rankingCoordinator.refreshAndEmit({ final: game.getSnapshot().status === 'FINISHED' })
  },
  onUserLogout: (userIds) => presence.disconnectUsers(userIds),
}))
app.use('/api/game', createGameRouter(game, {
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  beforeStart: async (snapshot) => {
    await eventCoordinator.prepareGameStart(snapshot)
  },
  resetGame: async () => {
    await eventProcessing
    return resetCoordinator.reset()
  },
}))
app.use('/api/events', createEventRouter(pool, game, {
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  haltDurationMs: eventHaltDurationMs,
}))
app.use('/api/intelligence', createIntelligenceRouter(pool, game, {
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  initialCash,
  onPurchaseCommitted: () => rankingCoordinator.refreshAndEmit(),
}))
app.use('/api/trading', createTradingRouter(pool, game, {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  initialCash,
  onTradeCommitted: () => rankingCoordinator.refreshAndEmit(),
  marketGate,
}))
app.use('/api/broadcast', createBroadcastRouter(pool, {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  beforeRead: () => eventProcessing,
  isHalted: marketGate.isHalted,
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
