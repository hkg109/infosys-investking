import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import './config.js'
import { pool } from './db.js'
import { createUserRouter } from './users.js'

const app = express()
const port = process.env.PORT || 3000
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
})

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)

  // Phase 1 connectivity test only. Add administrator authorization before use.
  socket.on('game:start', () => {
    io.emit('game:start')
  })

  socket.on('disconnect', (reason) => {
    console.log(`Socket disconnected: ${socket.id} (${reason})`)
  })
})

app.use(express.json({ limit: '8kb' }))
app.use('/api/users', createUserRouter(pool, {
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  secureCookies: process.env.NODE_ENV === 'production',
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
