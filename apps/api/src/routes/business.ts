import { businessUpdateSchema } from '@pollux/contracts'
import { Hono } from 'hono'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { getBusiness, updateBusiness } from '../services/business'
import { validate } from '../validator'

/**
 * Datos del negocio: the selected business's own data, the issuer on the Delivery note.
 * Only owners may edit it; every member is an owner today, so membership is the check.
 */
export const businessRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .get('/', async (c) => {
    return c.json(await getBusiness(c.var.db, c.var.businessId), 200)
  })
  .patch('/', validate('json', businessUpdateSchema), async (c) => {
    return c.json(await updateBusiness(c.var.db, c.var.businessId, c.req.valid('json')), 200)
  })
