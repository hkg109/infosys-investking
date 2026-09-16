import { Router } from 'express'
import { createRequireAdmin } from './admin-auth.js'
import {
  createEvent,
  deleteEvent,
  EventError,
  getGameSchedule,
  getRoundEvent,
  listEvents,
  updateEvent,
} from './events.js'

export function createEventRouter(database, engine, { adminPassword, clientUrl }) {
  const router = Router()

  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (request.headers.origin && request.headers.origin !== clientUrl) {
      return response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' })
    }
    if (request.headers.origin === clientUrl) {
      response.set('Access-Control-Allow-Origin', clientUrl)
      response.set('Access-Control-Allow-Credentials', 'true')
      response.vary('Origin')
    }
    if (request.method === 'OPTIONS') {
      response.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
      response.set('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      return response.sendStatus(204)
    }
    if (!database) return response.status(503).json({ error: 'DATABASE_UNAVAILABLE' })
    next()
  })

  router.get('/current', async (_request, response, next) => {
    try {
      const game = engine.getSnapshot()
      response.json({ game, event: await getRoundEvent(database, game.currentRound) })
    } catch (error) {
      next(error)
    }
  })

  router.use('/admin', createRequireAdmin(adminPassword))

  router.get('/admin', async (_request, response, next) => {
    try {
      response.json({ events: await listEvents(database) })
    } catch (error) {
      next(error)
    }
  })

  router.get('/admin/schedule', async (_request, response, next) => {
    try {
      response.json({ schedule: await getGameSchedule(database) })
    } catch (error) {
      next(error)
    }
  })

  const requireWaiting = (_request, response, next) => {
    const game = engine.getSnapshot()
    if (game.status !== 'WAITING') return response.status(409).json({ error: 'EVENT_MANAGEMENT_CLOSED', status: game.status })
    next()
  }

  router.post('/admin', requireWaiting, async (request, response, next) => {
    try {
      response.status(201).json({ event: await createEvent(database, request.body) })
    } catch (error) {
      if (error instanceof EventError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  router.put('/admin/:eventId', requireWaiting, async (request, response, next) => {
    try {
      response.json({ event: await updateEvent(database, request.params.eventId, request.body) })
    } catch (error) {
      if (error instanceof EventError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  router.delete('/admin/:eventId', requireWaiting, async (request, response, next) => {
    try {
      await deleteEvent(database, request.params.eventId)
      response.sendStatus(204)
    } catch (error) {
      if (error instanceof EventError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  return router
}
