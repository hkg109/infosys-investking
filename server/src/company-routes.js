import { Router } from 'express'
import { createRequireAdmin } from './admin-auth.js'
import { CompanyError, createCompany, deactivateCompany, listCompanies, updateCompany } from './companies.js'

export function createCompanyRouter(database, engine, { adminPassword, clientUrl }) {
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

  router.use('/admin', createRequireAdmin(adminPassword))

  router.get('/admin', async (_request, response, next) => {
    try {
      response.json({ companies: await listCompanies(database) })
    } catch (error) {
      next(error)
    }
  })

  const requireWaiting = (_request, response, next) => {
    const game = engine.getSnapshot()
    if (game.status !== 'WAITING') {
      return response.status(409).json({ error: 'COMPANY_MANAGEMENT_CLOSED', status: game.status })
    }
    next()
  }

  router.post('/admin', requireWaiting, async (request, response, next) => {
    try {
      response.status(201).json({ company: await createCompany(database, request.body) })
    } catch (error) {
      if (error instanceof CompanyError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  router.put('/admin/:companyId', requireWaiting, async (request, response, next) => {
    try {
      response.json({ company: await updateCompany(database, request.params.companyId, request.body) })
    } catch (error) {
      if (error instanceof CompanyError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  router.delete('/admin/:companyId', requireWaiting, async (request, response, next) => {
    try {
      await deactivateCompany(database, request.params.companyId)
      response.sendStatus(204)
    } catch (error) {
      if (error instanceof CompanyError) return response.status(error.status).json({ error: error.code, ...error.details })
      next(error)
    }
  })

  return router
}
