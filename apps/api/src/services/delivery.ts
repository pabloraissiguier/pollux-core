import { subtractMoney } from '@pollux/contracts'
import type { orderDeliverSchema } from '@pollux/contracts'
import { balanceEntries, orders } from '@pollux/db/schema'
import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { today } from '../dates'
import type { Database, Transaction } from '../db'
import { ApiError } from '../errors'
import { getOrder, lockOrder } from './orders'
import { lockProducts, recordStockMovements } from './stock'

type ValidOrderDeliver = z.output<typeof orderDeliverSchema>

const orderNotPending = () =>
  new ApiError(409, 'order_not_pending', 'Solo se puede entregar un pedido pendiente')
const orderNotDelivered = () =>
  new ApiError(409, 'order_not_delivered', 'Solo se puede deshacer la entrega de un pedido entregado')

const negateMoney = (amount: string) => subtractMoney('0.00', amount)

const isOrder = (businessId: string, orderId: string) =>
  and(eq(orders.businessId, businessId), eq(orders.id, orderId))

/**
 * Moves every line's quantity out of (`sign` −1) or back into (`sign` +1) On-hand stock, with
 * Stock movements that name the Order. Locks the Products first, in id order.
 */
async function moveOrderStock(
  tx: Transaction,
  businessId: string,
  profileId: string,
  order: Awaited<ReturnType<typeof getOrder>>,
  type: 'order_delivered' | 'delivery_undone',
) {
  const sign = type === 'order_delivered' ? -1 : 1
  await lockProducts(tx, businessId, order.lines.map(l => l.product.id))
  await recordStockMovements(tx, businessId, order.lines.map(l => ({
    type,
    orderId: order.id,
    productId: l.product.id,
    quantity: sign * l.quantity,
    createdBy: profileId,
  })))
}

/**
 * Entregar: marks a Pending Order Delivered, all or nothing. In one transaction it locks the
 * Order and then its Products, takes each line's quantity out of On-hand stock, debits the
 * Customer for the Order total (an `order_delivered` Balance entry dated by the Delivered date,
 * docs/adr/0001) and sets the status. Answers with the Order.
 */
export async function deliverOrder(
  db: Database,
  businessId: string,
  profileId: string,
  orderId: string,
  input: ValidOrderDeliver,
) {
  return db.transaction(async (tx) => {
    const locked = await lockOrder(tx, businessId, orderId)
    if (locked.status !== 'pending') throw orderNotPending()
    const order = await getOrder(tx, businessId, orderId)
    const deliveredOn = input.deliveredOn ?? today()

    await moveOrderStock(tx, businessId, profileId, order, 'order_delivered')
    // A fully discounted Order (total 0) charges nothing, and a Balance entry is never zero.
    if (order.totals.total !== '0.00') {
      await tx.insert(balanceEntries).values({
        businessId,
        customerId: order.customer.id,
        type: 'order_delivered',
        amount: order.totals.total,
        entryDate: deliveredOn,
        orderId,
        createdBy: profileId,
      })
    }
    await tx
      .update(orders)
      .set({ status: 'delivered', deliveredOn, updatedAt: sql`now()` })
      .where(isOrder(businessId, orderId))
    return getOrder(tx, businessId, orderId)
  })
}

/**
 * Deshacer entrega: returns a Delivered Order to Pending to fix a mistake. In one transaction it
 * puts each line's quantity back into On-hand stock and credits the Customer with exactly what
 * the delivery debited (a `delivery_undone` Balance entry on the same date as that debit, so the
 * two cancel out within any date range). Nothing is deleted; Payments are left alone.
 */
export async function undoDelivery(db: Database, businessId: string, profileId: string, orderId: string) {
  return db.transaction(async (tx) => {
    const locked = await lockOrder(tx, businessId, orderId)
    if (locked.status !== 'delivered') throw orderNotDelivered()
    const order = await getOrder(tx, businessId, orderId)

    await moveOrderStock(tx, businessId, profileId, order, 'delivery_undone')
    // An Order can be delivered, undone and delivered again, so what this delivery still debits
    // is the net of the Order's delivery entries, dated like its latest debit. Nothing to reverse
    // when the Order was delivered with a total of 0.
    const deliveryEntries = and(
      eq(balanceEntries.businessId, businessId),
      eq(balanceEntries.orderId, orderId),
      inArray(balanceEntries.type, ['order_delivered', 'delivery_undone']),
    )
    const [debited] = await tx
      .select({ amount: sql<string>`coalesce(sum(${balanceEntries.amount}), 0.00)` })
      .from(balanceEntries)
      .where(deliveryEntries)
    if (debited && debited.amount !== '0.00') {
      const [latest] = await tx
        .select({ entryDate: balanceEntries.entryDate })
        .from(balanceEntries)
        .where(and(deliveryEntries, eq(balanceEntries.type, 'order_delivered')))
        .orderBy(desc(balanceEntries.createdAt), desc(balanceEntries.id))
        .limit(1)
      await tx.insert(balanceEntries).values({
        businessId,
        customerId: order.customer.id,
        type: 'delivery_undone',
        amount: negateMoney(debited.amount),
        entryDate: latest!.entryDate,
        orderId,
        createdBy: profileId,
      })
    }
    await tx
      .update(orders)
      .set({ status: 'pending', deliveredOn: null, updatedAt: sql`now()` })
      .where(isOrder(businessId, orderId))
    return getOrder(tx, businessId, orderId)
  })
}
