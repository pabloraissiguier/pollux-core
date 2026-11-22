import { supplierCreateSchema, supplierListQuerySchema, supplierUpdateSchema } from '@pollux/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { createSupplier, getSupplier, listSuppliers, updateSupplier } from '../services/suppliers'
import { validate } from '../validator'

const supplierParam = z.object({ id: z.uuid() })

/** Suppliers: who the business buys from. No delete, and no Supplier balance yet. */
export const supplierRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .get('/', validate('query', supplierListQuerySchema), async (c) => {
    return c.json(await listSuppliers(c.var.db, c.var.businessId, c.req.valid('query')), 200)
  })
  .post('/', validate('json', supplierCreateSchema), async (c) => {
    return c.json(await createSupplier(c.var.db, c.var.businessId, c.req.valid('json')), 201)
  })
  .get('/:id', validate('param', supplierParam), async (c) => {
    return c.json(await getSupplier(c.var.db, c.var.businessId, c.req.valid('param').id), 200)
  })
  .patch('/:id', validate('param', supplierParam), validate('json', supplierUpdateSchema), async (c) => {
    const { db, businessId } = c.var
    return c.json(await updateSupplier(db, businessId, c.req.valid('param').id, c.req.valid('json')), 200)
  })
