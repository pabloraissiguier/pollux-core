import type { customerStatementQuerySchema } from '@pollux/contracts'
import { balanceEntries, customers, orders, payments } from '@pollux/db/schema'
import { and, asc, count, desc, eq, gte, lte, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { DbOrTx } from '../db'
import { customerNotFound, isCustomer } from './customers'

type ValidStatementQuery = z.output<typeof customerStatementQuerySchema>

/** The Customer's id and name, or 404 when it isn't in this business. */
async function findCustomer(db: DbOrTx, businessId: string, customerId: string) {
  const [customer] = await db
    .select({ id: customers.id, name: customers.name })
    .from(customers)
    .where(isCustomer(businessId, customerId))
  if (!customer) throw customerNotFound()
  return customer
}

/**
 * Saldo: what the Customer owes, always summed from their Balance entries (positive: they owe;
 * negative: they have credit).
 */
export async function getCustomerBalance(db: DbOrTx, businessId: string, customerId: string) {
  const customer = await findCustomer(db, businessId, customerId)
  const [row] = await db
    .select({ balance: sql<string>`coalesce(sum(${balanceEntries.amount}), 0.00)` })
    .from(balanceEntries)
    .where(and(eq(balanceEntries.businessId, businessId), eq(balanceEntries.customerId, customerId)))
  return { customer, balance: row!.balance }
}

/**
 * Resumen de cuenta: the Customer's Balance entries in date order, each with the Balance right
 * after it. Entries on the same day keep the order they were recorded in, with a debit before a
 * credit recorded in the same transaction (a delivery before the Payment taken with it). The
 * running Balance counts every earlier entry, also those before `from`.
 */
export async function getCustomerStatement(db: DbOrTx, businessId: string, customerId: string, query: ValidStatementQuery) {
  await findCustomer(db, businessId, customerId)
  const { from, to, limit, offset } = query

  const ledgerOrder = sql`${balanceEntries.entryDate}, ${balanceEntries.createdAt}, ${balanceEntries.amount} desc, ${balanceEntries.id}`
  const ledger = db
    .select({
      id: balanceEntries.id,
      type: balanceEntries.type,
      entryDate: balanceEntries.entryDate,
      amount: balanceEntries.amount,
      orderId: balanceEntries.orderId,
      paymentId: balanceEntries.paymentId,
      reason: balanceEntries.reason,
      createdAt: balanceEntries.createdAt,
      balance: sql<string>`sum(${balanceEntries.amount}) over (order by ${ledgerOrder})`.as('balance'),
    })
    .from(balanceEntries)
    .where(and(eq(balanceEntries.businessId, businessId), eq(balanceEntries.customerId, customerId)))
    .as('ledger')

  const inRange = and(
    from ? gte(ledger.entryDate, from) : undefined,
    to ? lte(ledger.entryDate, to) : undefined,
  )
  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: ledger.id,
        type: ledger.type,
        entryDate: ledger.entryDate,
        amount: ledger.amount,
        balance: ledger.balance,
        reason: ledger.reason,
        createdAt: ledger.createdAt,
        orderId: orders.id,
        orderNumber: orders.number,
        paymentId: payments.id,
        paymentMethod: payments.method,
      })
      .from(ledger)
      .leftJoin(orders, and(eq(orders.businessId, businessId), eq(orders.id, ledger.orderId)))
      .leftJoin(payments, and(eq(payments.businessId, businessId), eq(payments.id, ledger.paymentId)))
      .where(inRange)
      .orderBy(asc(ledger.entryDate), asc(ledger.createdAt), desc(ledger.amount), asc(ledger.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(ledger).where(inRange),
  ])

  return {
    items: rows.map(r => ({
      id: r.id,
      type: r.type,
      entryDate: r.entryDate,
      amount: r.amount,
      balance: r.balance,
      reason: r.reason,
      order: r.orderId ? { id: r.orderId, number: r.orderNumber! } : null,
      payment: r.paymentId ? { id: r.paymentId, method: r.paymentMethod! } : null,
      createdAt: r.createdAt,
    })),
    total: counted!.total,
  }
}
