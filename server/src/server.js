import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import './config.js'
import { pool } from './db.js'
import { GameEngine } from './game-engine.js'
import { createGameRouter } from './game-routes.js'
import { createUserRouter } from './users.js'

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer`)
  return parsed
}

const app = express()
const port = process.env.PORT || 3000
const httpServer = createServer(app)
const game = new GameEngine({
  totalRounds: positiveInteger(process.env.GAME_TOTAL_ROUNDS, 12, 'GAME_TOTAL_ROUNDS'),
  roundDurationMs: positiveInteger(process.env.GAME_ROUND_DURATION_MS, 10 * 60 * 1000, 'GAME_ROUND_DURATION_MS'),
  tradingDurationMs: positiveInteger(process.env.GAME_TRADING_DURATION_MS, 9 * 60 * 1000, 'GAME_TRADING_DURATION_MS'),
})
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
})

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)
  socket.emit('game:state', game.getSnapshot())

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`)
  })
})

game.on('game-event', ({ name, payload }) => {
  io.emit(name, payload)
  io.emit('game:state', payload)
})

app.use(express.json({ limit: '8kb' }))
app.use('/api/users', createUserRouter(pool, {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  secureCookies: process.env.NODE_ENV === 'production',
}))
app.use('/api/game', createGameRouter(game, {
  adminPassword: process.env.ADMIN_PASSWORD,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
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
