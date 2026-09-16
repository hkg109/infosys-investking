import { Router } from 'express'
import { createRequireAdmin } from './admin-auth.js'
import { createMission, deactivateMission, getMyMission, listMissions, MissionError, updateMission } from './missions.js'
import { requireSessionUser } from './session-auth.js'

export function createMissionRouter(database, engine, { adminPassword, clientUrl }) {
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

  router.get('/me', requireSessionUser(database), async (request, response, next) => {
    try {
      response.json(await getMyMission(database, request.user.id))
    } catch (error) {
      next(error)
    }
  })

  router.use('/admin', createRequireAdmin(adminPassword))

  router.get('/admin', async (_request, response, next) => {
    try {
      response.json(await listMissions(database))
    } catch (error) {
      next(error)
    }
  })

  const requireWaiting = (_request, response, next) => {
    const game = engine.getSnapshot()
    if (game.status !== 'WAITING') {
      return response.status(409).json({ error: 'MISSION_MANAGEMENT_CLOSED', status: game.status })
    }
    next()
  }

  const handleError = (error, response, next) => {
    if (error instanceof MissionError) return response.status(error.status).json({ error: error.code, ...error.details })
    next(error)
  }

  router.post('/admin', requireWaiting, async (request, response, next) => {
    try {
      response.status(201).json({ mission: await createMission(database, request.body) })
    } catch (error) {
      handleError(error, response, next)
    }
  })

  router.put('/admin/:missionId', requireWaiting, async (request, response, next) => {
    try {
      response.json({ mission: await updateMission(database, request.params.missionId, request.body) })
    } catch (error) {
      handleError(error, response, next)
    }
  })

  router.delete('/admin/:missionId', requireWaiting, async (request, response, next) => {
    try {
      await deactivateMission(database, request.params.missionId)
      response.sendStatus(204)
    } catch (error) {
      handleError(error, response, next)
    }
  })

  return router
}
