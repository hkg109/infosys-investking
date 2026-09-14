import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import { fileURLToPath } from 'node:url'

// Load the root .env when present; shell environment variables take precedence.
try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)))
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

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

app.use(express.json())

app.get('/api/health', (_request, response) => {
  response.status(200).json({ status: 'ok' })
})

httpServer.listen(port, () => {
  console.log(`Infosys InvestKing server is running on port ${httpServer.address().port}`)
})
