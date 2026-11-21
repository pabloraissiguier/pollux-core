import {
  branchSchema,
  branchUpdateSchema,
  customerCreateSchema,
  customerListQuerySchema,
  customerUpdateSchema,
} from '@pollux/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import {
  addBranch,
  createCustomer,
  getCustomer,
  listCustomers,
  updateBranch,
  updateCustomer,
} from '../services/customers'
import { validate } from '../validator'

const customerParam = z.object({ id: z.uuid() })
const branchParam = z.object({ id: z.uuid(), branchId: z.uuid() })

/**
 * Customers and their Branches. One kind of Customer: nothing about how they pay lives here.
 * Every write answers with the Customer's detail (with all its Branches).
 */
export const customerRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .get('/', validate('query', customerListQuerySchema), async (c) => {
    return c.json(await listCustomers(c.var.db, c.var.businessId, c.req.valid('query')), 200)
  })
  .post('/', validate('json', customerCreateSchema), async (c) => {
    const customer = await createCustomer(c.var.db, c.var.businessId, c.req.valid('json'))
    return c.json(customer, 201)
  })
  .get('/:id', validate('param', customerParam), async (c) => {
    return c.json(await getCustomer(c.var.db, c.var.businessId, c.req.valid('param').id), 200)
  })
  .patch('/:id', validate('param', customerParam), validate('json', customerUpdateSchema), async (c) => {
    const customer = await updateCustomer(c.var.db, c.var.businessId, c.req.valid('param').id, c.req.valid('json'))
    return c.json(customer, 200)
  })
  .post('/:id/branches', validate('param', customerParam), validate('json', branchSchema), async (c) => {
    const customer = await addBranch(c.var.db, c.var.businessId, c.req.valid('param').id, c.req.valid('json'))
    return c.json(customer, 201)
  })
  .patch('/:id/branches/:branchId', validate('param', branchParam), validate('json', branchUpdateSchema), async (c) => {
    const { id, branchId } = c.req.valid('param')
    const customer = await updateBranch(c.var.db, c.var.businessId, id, branchId, c.req.valid('json'))
    return c.json(customer, 200)
  })
