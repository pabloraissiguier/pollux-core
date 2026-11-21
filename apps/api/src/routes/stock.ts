import { initialCountSchema, stockAdjustmentSchema, stockMovementListQuerySchema } from '@pollux/contracts'
import { Hono } from 'hono'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { adjustStock, listStockMovements, recordInitialCount } from '../services/stock'
import { validate } from '../validator'

/**
 * Stock: Stock adjustments, the bulk initial count and each Product's Stock movements.
 * On-hand, Reserved and Available stock are on the Product itself (`/products`).
 */
export const stockRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .post('/adjustments', validate('json', stockAdjustmentSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await adjustStock(db, businessId, profileId, c.req.valid('json')), 201)
  })
  .post('/initial-count', validate('json', initialCountSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await recordInitialCount(db, businessId, profileId, c.req.valid('json')), 200)
  })
  .get('/movements', validate('query', stockMovementListQuerySchema), async (c) => {
    return c.json(await listStockMovements(c.var.db, c.var.businessId, c.req.valid('query')), 200)
  })
