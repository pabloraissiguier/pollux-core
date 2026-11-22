import type {
  balanceAdjustmentSchema,
  customersWithBalanceQuerySchema,
  customerStatementQuerySchema,
  openingBalanceSchema,
} from '@pollux/contracts'
import { balanceEntries, customers, orders, payments } from '@pollux/db/schema'
import { and, asc, count, desc, eq, gte, lte, ne, sql } from 'drizzle-orm'
import type { z } from 'zod'
import { today } from '../dates'
import type { Database, DbOrTx } from '../db'
import { ApiError } from '../errors'
import { isUniqueViolation } from '../pg-errors'
import { assertCustomer, customerNotFound, isCustomer } from './customers'

type ValidStatementQuery = z.output<typeof customerStatementQuerySchema>
type ValidOpeningBalance = z.output<typeof openingBalanceSchema>
type ValidBalanceAdjustment = z.output<typeof balanceAdjustmentSchema>
type ValidCustomersWithBalanceQuery = z.output<typeof customersWithBalanceQuerySchema>

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
 * negative: they have credit), plus `hasOpeningBalance`, whether their one Opening balance is
 * already entered. Both come from the same pass over the Customer's entries.
 */
export async function getCustomerBalance(db: DbOrTx, businessId: string, customerId: string) {
  const customer = await findCustomer(db, businessId, customerId)
  const [row] = await db
    .select({
      balance: sql<string>`coalesce(sum(${balanceEntries.amount}), 0.00)`,
      hasOpeningBalance: sql<boolean>`coalesce(bool_or(${balanceEntries.type} = 'opening_balance'), false)`,
    })
    .from(balanceEntries)
    .where(and(eq(balanceEntries.businessId, businessId), eq(balanceEntries.customerId, customerId)))
  return { customer, balance: row!.balance, hasOpeningBalance: row!.hasOpeningBalance }
}

/**
 * Resumen de cuenta: the Customer's Balance entries in date order, each with the Balance right
 * after it. Entries on the same day keep the order they were recorded in, with a debit before a
 * credit recorded in the same transaction (a delivery before the Payment taken with it). The
 * running Balance counts every earlier entry, also those before `from`.
 */
export async function getCustomerStatement(db: DbOrTx, businessId: string, customerId: string, query: ValidStatementQuery) {
  await assertCustomer(db, businessId, customerId)
  const { from, to, limit, offset } = query

  // One ordering for both the running Balance and the rows, so they can't drift apart.
  const ledgerOrder = sql`order by ${balanceEntries.entryDate}, ${balanceEntries.createdAt}, ${balanceEntries.amount} desc, ${balanceEntries.id}`
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
      balance: sql<string>`sum(${balanceEntries.amount}) over (${ledgerOrder})`.as('balance'),
      position: sql<number>`row_number() over (${ledgerOrder})`.as('position'),
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
      .orderBy(asc(ledger.position))
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

interface ManualEntry {
  type: 'opening_balance' | 'adjustment'
  amount: string
  entryDate: string
  reason: string | null
}

/**
 * Inserts an Opening balance or a Balance adjustment and answers with the Customer's Balance
 * after it plus the new entry: `{ customer, balance, entry }`. One transaction, so the Balance
 * answered is the one right after this entry.
 */
function addManualEntry(db: Database, businessId: string, profileId: string, customerId: string, input: ManualEntry) {
  return db.transaction(async (tx) => {
    await assertCustomer(tx, businessId, customerId)
    const [entry] = await tx
      .insert(balanceEntries)
      .values({ businessId, customerId, createdBy: profileId, ...input })
      .returning({
        id: balanceEntries.id,
        type: balanceEntries.type,
        entryDate: balanceEntries.entryDate,
        amount: balanceEntries.amount,
        reason: balanceEntries.reason,
        createdAt: balanceEntries.createdAt,
      })
      .catch((err: unknown) => {
        if (isUniqueViolation(err, 'balance_entries_opening_balance_key')) {
          throw new ApiError(409, 'opening_balance_exists', 'Este cliente ya tiene un saldo inicial')
        }
        throw err
      })
    return { ...(await getCustomerBalance(tx, businessId, customerId)), entry: entry! }
  })
}

/**
 * Saldo inicial: the Balance the Customer carried over from before the app, on its day. Once per
 * Customer (409 `opening_balance_exists`), enforced by a partial unique index so two sent at
 * the same moment can't both land.
 */
export function addOpeningBalance(db: Database, businessId: string, profileId: string, customerId: string, input: ValidOpeningBalance) {
  return addManualEntry(db, businessId, profileId, customerId, { type: 'opening_balance', reason: null, ...input })
}

/** Ajuste de saldo: a manual, non-zero change to the Balance with its reason, dated today by default. */
export function addBalanceAdjustment(db: Database, businessId: string, profileId: string, customerId: string, input: ValidBalanceAdjustment) {
  const { amount, reason, entryDate = today() } = input
  return addManualEntry(db, businessId, profileId, customerId, { type: 'adjustment', amount, reason, entryDate })
}

/**
 * Customers with a Balance: every Customer whose Balance isn't zero, largest first (credits last),
 * plus `balanceTotal`, the sum of all their Balances (what the business is owed, net of credits).
 */
export async function listCustomersWithBalance(db: DbOrTx, businessId: string, query: ValidCustomersWithBalanceQuery) {
  const balance = sql<string>`sum(${balanceEntries.amount})`
  const balances = db
    .select({ customerId: balanceEntries.customerId, balance: balance.as('balance') })
    .from(balanceEntries)
    .where(eq(balanceEntries.businessId, businessId))
    .groupBy(balanceEntries.customerId)
    .having(ne(balance, '0.00'))
    .as('balances')

  const [rows, [summary]] = await Promise.all([
    db
      .select({ id: customers.id, name: customers.name, balance: balances.balance })
      .from(balances)
      .innerJoin(customers, and(eq(customers.businessId, businessId), eq(customers.id, balances.customerId)))
      .orderBy(desc(balances.balance), asc(customers.name), asc(customers.id))
      .limit(query.limit)
      .offset(query.offset),
    db
      .select({ total: count(), balanceTotal: sql<string>`coalesce(sum(${balances.balance}), 0.00)` })
      .from(balances),
  ])

  return {
    items: rows.map(r => ({ customer: { id: r.id, name: r.name }, balance: r.balance })),
    total: summary!.total,
    balanceTotal: summary!.balanceTotal,
  }
}
