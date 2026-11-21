import {
  priceHistoryQuerySchema,
  productCreateSchema,
  productListQuerySchema,
  productUpdateSchema,
} from '@pollux/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { createProduct, getPriceHistory, getProduct, listProducts, updateProduct } from '../services/products'
import { validate } from '../validator'

const productParam = z.object({ id: z.uuid() })

/**
 * The Product catalog. Products are never deleted: `PATCH { isActive: false }` makes one
 * Inactive. A new Price (on create or `PATCH`) is kept in the Product's price history.
 * Every write answers with the Product's detail.
 */
export const productRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .get('/', validate('query', productListQuerySchema), async (c) => {
    return c.json(await listProducts(c.var.db, c.var.businessId, c.req.valid('query')), 200)
  })
  .post('/', validate('json', productCreateSchema), async (c) => {
    return c.json(await createProduct(c.var.db, c.var.businessId, c.var.profileId, c.req.valid('json')), 201)
  })
  .get('/:id', validate('param', productParam), async (c) => {
    return c.json(await getProduct(c.var.db, c.var.businessId, c.req.valid('param').id), 200)
  })
  .patch('/:id', validate('param', productParam), validate('json', productUpdateSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await updateProduct(db, businessId, profileId, c.req.valid('param').id, c.req.valid('json')), 200)
  })
  .get('/:id/price-history', validate('param', productParam), validate('query', priceHistoryQuerySchema), async (c) => {
    const { db, businessId } = c.var
    return c.json(await getPriceHistory(db, businessId, c.req.valid('param').id, c.req.valid('query')), 200)
  })
