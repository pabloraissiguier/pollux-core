import { orderCreateSchema, orderDeliverSchema, orderListQuerySchema, orderUpdateSchema } from '@pollux/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { requireBusiness } from '../auth/session'
import type { AppEnv } from '../context'
import { deliverOrder, undoDelivery } from '../services/delivery'
import { issueDeliveryNote } from '../services/delivery-notes'
import { cancelOrder, createOrder, getOrder, listOrders, updateOrder } from '../services/orders'
import { validate } from '../validator'

const orderParam = z.object({ id: z.uuid() })

/**
 * Orders (Pedidos): taken in the field or by phone through the same flow, edited while Pending,
 * cancelled, delivered (and undone), and listed for the reparto. Create and edit answer with the Order plus `warnings`
 * for lines that leave Available stock negative. `POST /:id/delivery-note` issues the Order's
 * Delivery note (Remito), or answers with it again on a reprint.
 */
export const orderRoutes = new Hono<AppEnv>()
  .use(requireBusiness)
  .get('/', validate('query', orderListQuerySchema), async (c) => {
    return c.json(await listOrders(c.var.db, c.var.businessId, c.req.valid('query')), 200)
  })
  .post('/', validate('json', orderCreateSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await createOrder(db, businessId, profileId, c.req.valid('json')), 201)
  })
  .get('/:id', validate('param', orderParam), async (c) => {
    return c.json(await getOrder(c.var.db, c.var.businessId, c.req.valid('param').id), 200)
  })
  .patch('/:id', validate('param', orderParam), validate('json', orderUpdateSchema), async (c) => {
    return c.json(await updateOrder(c.var.db, c.var.businessId, c.req.valid('param').id, c.req.valid('json')), 200)
  })
  .post('/:id/cancel', validate('param', orderParam), async (c) => {
    return c.json(await cancelOrder(c.var.db, c.var.businessId, c.req.valid('param').id), 200)
  })
  .post('/:id/deliver', validate('param', orderParam), validate('json', orderDeliverSchema), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await deliverOrder(db, businessId, profileId, c.req.valid('param').id, c.req.valid('json')), 200)
  })
  .post('/:id/undo-delivery', validate('param', orderParam), async (c) => {
    const { db, businessId, profileId } = c.var
    return c.json(await undoDelivery(db, businessId, profileId, c.req.valid('param').id), 200)
  })
  .post('/:id/delivery-note', validate('param', orderParam), async (c) => {
    return c.json(await issueDeliveryNote(c.var.db, c.var.businessId, c.req.valid('param').id), 200)
  })
