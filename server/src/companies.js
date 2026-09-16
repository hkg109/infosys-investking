export class CompanyError extends Error {
  constructor(status, code, details = {}) {
    super(code)
    this.name = 'CompanyError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function number(value) {
  return value === null || value === undefined ? null : Number(value)
}

function companyJson(row) {
  return {
    companyId: row.id,
    name: row.name,
    description: row.description,
    initialPrice: number(row.initial_price),
    currentPrice: number(row.current_price),
    isActive: row.is_active,
    references: {
      transactions: number(row.transaction_count) || 0,
      holdings: number(row.holding_count) || 0,
      eventEffects: number(row.event_effect_count) || 0,
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeCompanyId(value) {
  const companyId = typeof value === 'string' ? value.trim().toUpperCase() : ''
  if (!/^[A-Z0-9][A-Z0-9_-]{0,19}$/.test(companyId)) {
    throw new CompanyError(400, 'INVALID_COMPANY')
  }
  return companyId
}

function validateCompanyInput(body, { includeId = false, requireActive = false } = {}) {
  const companyId = includeId ? normalizeCompanyId(body?.companyId) : undefined
  const name = typeof body?.name === 'string' ? body.name.trim().normalize('NFC') : ''
  const description = typeof body?.description === 'string' ? body.description.trim().normalize('NFC') : ''
  const initialPrice = body?.initialPrice
  const isActive = body?.isActive === undefined && !requireActive ? true : body?.isActive
  if (!name || [...name].length > 60 || /[\p{Cc}\p{Cf}]/u.test(name) || description.length > 2_000 ||
      /[\p{Cc}\p{Cf}]/u.test(description) || !Number.isSafeInteger(initialPrice) || initialPrice < 1 ||
      typeof isActive !== 'boolean') {
    throw new CompanyError(400, 'INVALID_COMPANY')
  }
  return { companyId, name, description, initialPrice, isActive }
}

const companySelect = `SELECT c.*,
  (SELECT COUNT(*) FROM transactions t WHERE t.company_id = c.id) AS transaction_count,
  (SELECT COUNT(*) FROM portfolios p WHERE p.company_id = c.id AND p.quantity > 0) AS holding_count,
  (SELECT COUNT(*) FROM event_effects ee WHERE ee.company_id = c.id) AS event_effect_count
  FROM companies c`

async function readCompany(database, companyId) {
  const result = await database.query(`${companySelect} WHERE c.id = $1`, [companyId])
  return result.rows[0] ? companyJson(result.rows[0]) : null
}

export async function listCompanies(database) {
  const result = await database.query(`${companySelect} ORDER BY c.id`)
  return result.rows.map(companyJson)
}

export async function createCompany(database, input) {
  const company = validateCompanyInput(input, { includeId: true })
  try {
    await database.query(`INSERT INTO companies
      (id, name, description, initial_price, current_price, is_active)
      VALUES ($1, $2, $3, $4, $4, $5)`, [
      company.companyId, company.name, company.description, company.initialPrice, company.isActive,
    ])
    return readCompany(database, company.companyId)
  } catch (error) {
    if (error.code === '23505') throw new CompanyError(409, 'COMPANY_ID_TAKEN')
    throw error
  }
}

export async function updateCompany(database, companyId, input) {
  const id = normalizeCompanyId(companyId)
  const company = validateCompanyInput(input, { requireActive: true })
  const result = await database.query(`UPDATE companies SET
      name = $2, description = $3, initial_price = $4, current_price = $4,
      is_active = $5, updated_at = NOW()
    WHERE id = $1 RETURNING id`, [id, company.name, company.description, company.initialPrice, company.isActive])
  if (!result.rows[0]) throw new CompanyError(404, 'COMPANY_NOT_FOUND')
  return readCompany(database, id)
}

export async function deactivateCompany(database, companyId) {
  const id = normalizeCompanyId(companyId)
  const result = await database.query(`UPDATE companies SET is_active = FALSE, updated_at = NOW()
    WHERE id = $1 RETURNING id`, [id])
  if (!result.rows[0]) throw new CompanyError(404, 'COMPANY_NOT_FOUND')
}
