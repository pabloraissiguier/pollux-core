import { categoryListQuerySchema, categorySchema } from '@pollux/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { createCategory, listCategories, renameCategory } from '../services/categories'
import { validate } from '../validator'

const categoryParam = z.object({ id: z.uuid() })

/** Categories: create, rename and list. Their names are unique within the business. */
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
