import { orderTotals } from '@pollux/contracts'
import { branches, businesses, customers, orders } from '@pollux/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import type { Database, Transaction } from '../db'
import { ApiError } from '../errors'
import { isOrder, orderNotFound, selectLines, toLine } from './orders'
import { nextNumber } from './sequences'

const orderCancelled = () =>
  new ApiError(409, 'order_cancelled', 'El pedido está cancelado y no tiene remito: no se puede emitir uno nuevo')

/**
 * Issues the Order's Delivery note, or gets it when it was already issued. The first issue takes
 * the business's next `delivery_note` number and records when; later calls (reprints) answer with
 * the same number and time. Allowed for Pending and Delivered Orders, and for a Cancelled Order
 * that already has a number; a Cancelled Order without one is 409 `order_cancelled`.
 *
 * The Order row is locked first, so two issues of the same Order at once share one number.
 */
export async function issueDeliveryNote(db: Database, businessId: string, orderId: string) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({ status: orders.status, deliveryNoteNumber: orders.deliveryNoteNumber })
      .from(orders)
      .where(isOrder(businessId, orderId))
      .for('update')
    if (!order) throw orderNotFound()

    if (order.deliveryNoteNumber === null) {
      if (order.status === 'cancelled') throw orderCancelled()
      const number = await nextNumber(tx, businessId, 'delivery_note')
      await tx
        .update(orders)
        .set({ deliveryNoteNumber: number, deliveryNoteIssuedAt: sql`now()`, updatedAt: sql`now()` })
        .where(isOrder(businessId, orderId))
    }
    return getDeliveryNote(tx, businessId, orderId)
  })
}

/** The data printed on a Delivery note, for an Order that already has its number: business, Customer, Branch, Order, lines, totals. */
async function getDeliveryNote(tx: Transaction, businessId: string, orderId: string) {
  const [row] = await tx
    .select({
      number: orders.deliveryNoteNumber,
      issuedAt: orders.deliveryNoteIssuedAt,
      business: {
        name: businesses.name,
        legalName: businesses.legalName,
        cuit: businesses.cuit,
        vatCondition: businesses.vatCondition,
        address: businesses.address,
        city: businesses.city,
        province: businesses.province,
        postalCode: businesses.postalCode,
        phone: businesses.phone,
        grossIncomeNumber: businesses.grossIncomeNumber,
        activityStartDate: businesses.activityStartDate,
      },
      customer: {
        id: customers.id,
        name: customers.name,
        legalName: customers.legalName,
        cuit: customers.cuit,
        vatCondition: customers.vatCondition,
        phone: customers.phone,
      },
      branch: {
        id: branches.id,
        name: branches.name,
        address: branches.address,
        city: branches.city,
        province: branches.province,
        postalCode: branches.postalCode,
      },
      order: {
        id: orders.id,
        number: orders.number,
        status: orders.status,
        deliveryDate: orders.deliveryDate,
        deliveredOn: orders.deliveredOn,
        discountPercent: orders.discountPercent,
        notes: orders.notes,
      },
    })
    .from(orders)
    .innerJoin(businesses, eq(businesses.id, orders.businessId))
    .innerJoin(customers, and(eq(customers.businessId, businessId), eq(customers.id, orders.customerId)))
    .innerJoin(branches, and(eq(branches.businessId, businessId), eq(branches.id, orders.branchId)))
    .where(isOrder(businessId, orderId))

  const lineRows = await selectLines(tx, businessId, [orderId])

  const { number, issuedAt, ...rest } = row!
  return {
    number: number!,
    issuedAt: issuedAt!,
    ...rest,
    lines: lineRows.map(toLine),
    totals: orderTotals(lineRows, row!.order.discountPercent),
  }
}
