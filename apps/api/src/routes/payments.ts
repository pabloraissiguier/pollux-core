import { paymentCreateSchema, paymentListQuerySchema, paymentVoidSchema } from '@pollux/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { getPayment, listPayments, recordPayment, voidPayment } from '../services/payments'
import { validate } from '../validator'

const paymentParam = z.object({ id: z.uuid() })

/**
 * Payments (Pagos): money received from a Customer, with its Payment method. A Payment taken at
 * the door is recorded by delivering the Order (`POST /orders/:id/deliver` with `payment`).
 * Mistaken Payments are voided, never deleted. `GET /?customerId=` is the Customer's paying history.
 */
export const paymentRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .get('/', validate('query', paymentListQuerySchema), async (c) => {
    return c.json(await listPayments(c.var.db, c.var.businessId, c.req.valid('query')), 200)
  })
  .post('/', validate('json', paymentCreateSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await recordPayment(db, businessId, profileId, c.req.valid('json')), 201)
  })
  .get('/:id', validate('param', paymentParam), async (c) => {
    return c.json(await getPayment(c.var.db, c.var.businessId, c.req.valid('param').id), 200)
  })
  .post('/:id/void', validate('param', paymentParam), validate('json', paymentVoidSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    const { id } = c.req.valid('param')
    return c.json(await voidPayment(db, businessId, profileId, id, c.req.valid('json').reason), 200)
  })
