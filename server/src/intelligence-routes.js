import { Router } from 'express'
import { createRequireAdmin } from './admin-auth.js'
import { requireSessionUser } from './session-auth.js'
import { IntelligenceError, listClues, saveClue, deactivateClue, getIntelligence, purchaseClue } from './intelligence.js'

export function createIntelligenceRouter(database, engine, {
  adminPassword,
  clientUrl,
  initialCash = 1_000_000,
  onPurchaseCommitted = async () => {},
}) {
  const router = Router()
  router.use((request, response, next) => {
    response.set('Cache-Control', 'no-store')
    if (request.headers.origin && request.headers.origin !== clientUrl) return response.status(403).json({ error: 'ORIGIN_NOT_ALLOWED' })
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
  const route = work => async (request, response, next) => {
    try { await work(request, response) }
    catch (error) {
      if (error instanceof IntelligenceError) return response.status(error.status).json({ error: error.code })
      next(error)
    }
  }
  router.get('/me', requireSessionUser(database), route(async (req, res) => res.json(await getIntelligence(database, engine, req.user.id, initialCash))))
  router.post('/purchases', requireSessionUser(database), route(async (req, res) => {
    const result = await purchaseClue(database, engine, req.user.id, req.body, initialCash)
    // A ranking/socket refresh is a projection of an already committed purchase.
    // Never report the purchase as failed just because that follow-up refresh failed.
    try { await onPurchaseCommitted({ userId: req.user.id }) }
    catch (error) { console.error('Failed to refresh projections after intelligence purchase:', error) }
    res.json(result)
  }))
  router.use('/admin', createRequireAdmin(adminPassword))
  router.get('/admin', route(async (_req, res) => res.json(await listClues(database))))
  router.post('/admin', route(async (req, res) => res.status(201).json(await saveClue(database, engine, null, req.body))))
  router.put('/admin/:clueId', route(async (req, res) => res.json(await saveClue(database, engine, req.params.clueId, req.body))))
  router.delete('/admin/:clueId', route(async (req, res) => { await deactivateClue(database, engine, req.params.clueId); res.sendStatus(204) }))
  return router
}
