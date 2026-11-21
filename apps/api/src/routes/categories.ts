import { categoryListQuerySchema, categoryPriceUpdateSchema, categorySchema } from '@pollux/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { applyCategoryPriceUpdate, previewCategoryPriceUpdate } from '../services/category-price-update'
import { createCategory, listCategories, renameCategory } from '../services/categories'
import { validate } from '../validator'

const categoryParam = z.object({ id: z.uuid() })

/**
 * Categories: create, rename and list. Their names are unique within the business.
 * A Category Price update changes every Active Product in it by a percentage: `preview` answers
 * the old and new Prices without writing; the plain route applies them, with price history.
 */
export const categoryRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .get('/', validate('query', categoryListQuerySchema), async (c) => {
    return c.json(await listCategories(c.var.db, c.var.businessId, c.req.valid('query')), 200)
  })
  .post('/', validate('json', categorySchema), async (c) => {
    return c.json(await createCategory(c.var.db, c.var.businessId, c.req.valid('json')), 201)
  })
  .patch('/:id', validate('param', categoryParam), validate('json', categorySchema), async (c) => {
    return c.json(await renameCategory(c.var.db, c.var.businessId, c.req.valid('param').id, c.req.valid('json')), 200)
  })
  .post('/:id/price-update/preview', validate('param', categoryParam), validate('json', categoryPriceUpdateSchema), async (c) => {
    const { db, businessId } = c.var
    return c.json(await previewCategoryPriceUpdate(db, businessId, c.req.valid('param').id, c.req.valid('json')), 200)
  })
  .post('/:id/price-update', validate('param', categoryParam), validate('json', categoryPriceUpdateSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await applyCategoryPriceUpdate(db, businessId, profileId, c.req.valid('param').id, c.req.valid('json')), 200)
  })
