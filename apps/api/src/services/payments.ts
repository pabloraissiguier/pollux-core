import { subtractMoney } from '@pollux/contracts'
import type { PaymentMethod, paymentCreateSchema, paymentListQuerySchema } from '@pollux/contracts'
import { balanceEntries, customers, orders, payments } from '@pollux/db/schema'
import { and, count, desc, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { today } from '../dates'
import type { Database, DbOrTx, Transaction } from '../db'
import { ApiError } from '../errors'
import { assertCustomer } from './customers'
import { assertOrderOfCustomer } from './orders'

type ValidPaymentCreate = z.output<typeof paymentCreateSchema>
type ValidPaymentListQuery = z.output<typeof paymentListQuerySchema>

const paymentNotFound = () => new ApiError(404, 'payment_not_found', 'No encontramos el pago')
const paymentAlreadyVoided = () => new ApiError(409, 'payment_already_voided', 'El pago ya está anulado')

const isPayment = (businessId: string, paymentId: string) =>
  and(eq(payments.businessId, businessId), eq(payments.id, paymentId))

/** Payments joined to their Customer and noted Order, in this business. */
function selectPayments(db: DbOrTx, businessId: string) {
  return db
    .select({
      id: payments.id,
      customerId: customers.id,
      customerName: customers.name,
      orderId: orders.id,
      orderNumber: orders.number,
      amount: payments.amount,
      method: payments.method,
      paidOn: payments.paidOn,
      reference: payments.reference,
      voidedAt: payments.voidedAt,
      voidReason: payments.voidReason,
      createdAt: payments.createdAt,
    })
    .from(payments)
    .innerJoin(customers, and(eq(customers.businessId, businessId), eq(customers.id, payments.customerId)))
    .leftJoin(orders, and(eq(orders.businessId, businessId), eq(orders.id, payments.orderId)))
}

type PaymentRow = Awaited<ReturnType<typeof selectPayments>>[number]

/** The Payment as the API shows it. A voided Payment stays, with `voidedAt` and `voidReason`. */
function toPayment(r: PaymentRow) {
  return {
    id: r.id,
    customer: { id: r.customerId, name: r.customerName },
    order: r.orderId ? { id: r.orderId, number: r.orderNumber! } : null,
    amount: r.amount,
    method: r.method,
    paidOn: r.paidOn,
    reference: r.reference,
    voidedAt: r.voidedAt,
    voidReason: r.voidReason,
    createdAt: r.createdAt,
  }
}

const newestFirst = [desc(payments.paidOn), desc(payments.createdAt), desc(payments.id)]

/** One Payment, or 404 when it isn't in this business. */
export async function getPayment(db: DbOrTx, businessId: string, paymentId: string) {
  const [row] = await selectPayments(db, businessId).where(isPayment(businessId, paymentId))
  if (!row) throw paymentNotFound()
  return toPayment(row)
}

/** The Payments noted against an Order, newest first (voided ones included). */
export async function orderPayments(db: DbOrTx, businessId: string, orderId: string) {
  const rows = await selectPayments(db, businessId)
    .where(and(eq(payments.businessId, businessId), eq(payments.orderId, orderId)))
    .orderBy(...newestFirst)
  return rows.map(toPayment)
}

/** A Payment to insert, already checked: the noted Order (if any) is the Customer's. */
export interface NewPayment {
  customerId: string
  orderId: string | null
  amount: string
  method: PaymentMethod
  reference: string | null
  paidOn: string
}

/**
 * Inserts a Payment and its `payment` Balance entry (a credit, dated by `paidOn`) inside the
 * caller's transaction. The caller has checked the Customer and the noted Order. Returns its id.
 */
export async function insertPayment(tx: Transaction, businessId: string, profileId: string, payment: NewPayment) {
  const [inserted] = await tx
    .insert(payments)
    .values({ businessId, ...payment, createdBy: profileId })
    .returning({ id: payments.id })
  await tx.insert(balanceEntries).values({
    businessId,
    customerId: payment.customerId,
    type: 'payment',
    amount: subtractMoney('0.00', payment.amount),
    entryDate: payment.paidOn,
    paymentId: inserted!.id,
    createdBy: profileId,
  })
  return inserted!.id
}

/**
 * Registrar pago: money received from a Customer lowers their Balance as a whole. The noted
 * Order, if any, must be the same Customer's; it is kept for history only.
 */
export async function recordPayment(db: Database, businessId: string, profileId: string, input: ValidPaymentCreate) {
  return db.transaction(async (tx) => {
    await assertCustomer(tx, businessId, input.customerId)
    const orderId = input.orderId ?? null
    if (orderId) await assertOrderOfCustomer(tx, businessId, input.customerId, orderId)
    const id = await insertPayment(tx, businessId, profileId, {
      customerId: input.customerId,
      orderId,
      amount: input.amount,
      method: input.method,
      reference: input.reference ?? null,
      paidOn: input.paidOn ?? today(),
    })
    return getPayment(tx, businessId, id)
  })
}

/**
 * Anular pago: the Payment stays on record, marked void with its reason, and a `payment_voided`
 * Balance entry reverses it, dated like the Payment so the pair cancels out in any date range.
 * The Payment row is locked first, so it can't be voided twice.
 */
export async function voidPayment(db: Database, businessId: string, profileId: string, paymentId: string, reason: string) {
  return db.transaction(async (tx) => {
    const [payment] = await tx
      .select({ customerId: payments.customerId, amount: payments.amount, paidOn: payments.paidOn, voidedAt: payments.voidedAt })
      .from(payments)
      .where(isPayment(businessId, paymentId))
      .for('update')
    if (!payment) throw paymentNotFound()
    if (payment.voidedAt) throw paymentAlreadyVoided()

    await tx
      .update(payments)
      .set({ voidedAt: sql`now()`, voidedBy: profileId, voidReason: reason })
      .where(isPayment(businessId, paymentId))
    await tx.insert(balanceEntries).values({
      businessId,
      customerId: payment.customerId,
      type: 'payment_voided',
      amount: payment.amount,
      entryDate: payment.paidOn,
      paymentId,
      reason,
      createdBy: profileId,
    })
    return getPayment(tx, businessId, paymentId)
  })
}

/** Payments by Customer and/or noted Order, newest first; voided ones included and marked. */
export async function listPayments(db: Database, businessId: string, query: ValidPaymentListQuery) {
  const { customerId, orderId, limit, offset } = query
  const where = and(
    eq(payments.businessId, businessId),
    customerId ? eq(payments.customerId, customerId) : undefined,
    orderId ? eq(payments.orderId, orderId) : undefined,
  )
  const [rows, [counted]] = await Promise.all([
    selectPayments(db, businessId).where(where).orderBy(...newestFirst).limit(limit).offset(offset),
    db.select({ total: count() }).from(payments).where(where),
  ])
  return { items: rows.map(toPayment), total: counted!.total }
}
