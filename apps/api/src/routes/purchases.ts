import { purchaseCreateSchema, purchaseListQuerySchema } from '@pollux/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { createPurchase, getPurchase, listPurchases } from '../services/purchases'
import { validate } from '../validator'

const purchaseParam = z.object({ id: z.uuid() })

/** Purchases: register, list and detail. Insert-only: there is no edit and no delete. */
export const purchaseRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .get('/', validate('query', purchaseListQuerySchema), async (c) => {
    return c.json(await listPurchases(c.var.db, c.var.businessId, c.req.valid('query')), 200)
  })
  .post('/', validate('json', purchaseCreateSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await createPurchase(db, businessId, profileId, c.req.valid('json')), 201)
  })
  .get('/:id', validate('param', purchaseParam), async (c) => {
    return c.json(await getPurchase(c.var.db, c.var.businessId, c.req.valid('param').id), 200)
  })
