import { BALANCE_ENTRY_TYPES, PAYMENT_METHODS } from '@pollux/contracts'
import { sql } from 'drizzle-orm'
import { check, date, foreignKey, index, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { app, businessId, createdAt, id, money } from './_shared'
import { customers } from './customers'
import { orders } from './orders'
import { businesses, profiles } from './tenancy'

/** Medio de pago. "On account" is not a method: it means no Payment was recorded (docs/adr/0001). */
export const paymentMethod = app.enum('payment_method', PAYMENT_METHODS)

/**
 * Pago. Lowers the customer's Balance as a whole and is never allocated to an Order.
 * `orderId` only records the Order it was collected with, for history.
 * A voided Payment stays on record; its reversal is a separate Balance entry.
 */
export const payments = app.table('payments', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  customerId: uuid('customer_id').notNull(),
  orderId: uuid('order_id'),
  amount: money('amount').notNull(),
  method: paymentMethod('method').notNull(),
  reference: text('reference'),
  paidOn: date('paid_on').notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidedBy: uuid('voided_by').references(() => profiles.id),
  voidReason: text('void_reason'),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: createdAt(),
}, t => [
  unique('payments_business_id_id_key').on(t.businessId, t.id),
  index('payments_business_id_customer_id_idx').on(t.businessId, t.customerId, t.paidOn),
  index('payments_business_id_order_id_idx').on(t.businessId, t.orderId),
  foreignKey({
    name: 'payments_customer_fk',
    columns: [t.businessId, t.customerId],
    foreignColumns: [customers.businessId, customers.id],
  }),
  // When an Order is noted, it must belong to the same Customer (skipped when order_id is null).
  foreignKey({
    name: 'payments_order_fk',
    columns: [t.businessId, t.customerId, t.orderId],
    foreignColumns: [orders.businessId, orders.customerId, orders.id],
  }),
  check('payments_amount_check', sql`${t.amount} > 0`),
  check('payments_void_check', sql`(${t.voidedAt} is null) = (${t.voidReason} is null)`),
]).enableRLS()

export const balanceEntryType = app.enum('balance_entry_type', BALANCE_ENTRY_TYPES)

/**
 * Movimiento de cuenta. A customer's Balance is the sum of `amount` over their entries:
 * positive means the customer owes more (debit), negative means they owe less (credit).
 * Entries are only ever inserted, never edited or deleted.
 */
export const balanceEntries = app.table('balance_entries', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  customerId: uuid('customer_id').notNull(),
  type: balanceEntryType('type').notNull(),
  amount: money('amount').notNull(),
  entryDate: date('entry_date').notNull(),
  orderId: uuid('order_id'),
  paymentId: uuid('payment_id'),
  reason: text('reason'),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: createdAt(),
}, t => [
  index('balance_entries_customer_idx').on(t.businessId, t.customerId, t.entryDate),
  index('balance_entries_order_idx').on(t.businessId, t.orderId),
  index('balance_entries_payment_idx').on(t.businessId, t.paymentId),
  // Saldo inicial: at most one per Customer, so carried-over debt is never counted twice.
  uniqueIndex('balance_entries_opening_balance_key')
    .on(t.businessId, t.customerId)
    .where(sql`${t.type} = 'opening_balance'`),
  foreignKey({
    name: 'balance_entries_customer_fk',
    columns: [t.businessId, t.customerId],
    foreignColumns: [customers.businessId, customers.id],
  }),
  foreignKey({
    name: 'balance_entries_order_fk',
    columns: [t.businessId, t.customerId, t.orderId],
    foreignColumns: [orders.businessId, orders.customerId, orders.id],
  }),
  foreignKey({
    name: 'balance_entries_payment_fk',
    columns: [t.businessId, t.paymentId],
    foreignColumns: [payments.businessId, payments.id],
  }),
  check('balance_entries_amount_check', sql`${t.amount} <> 0`),
  check('balance_entries_source_check', sql`
    case ${t.type}
      when 'order_delivered' then ${t.orderId} is not null and ${t.paymentId} is null and ${t.amount} > 0
      when 'delivery_undone' then ${t.orderId} is not null and ${t.paymentId} is null and ${t.amount} < 0
      when 'payment' then ${t.paymentId} is not null and ${t.orderId} is null and ${t.amount} < 0
      when 'payment_voided' then ${t.paymentId} is not null and ${t.orderId} is null and ${t.amount} > 0
      when 'opening_balance' then ${t.orderId} is null and ${t.paymentId} is null
      when 'adjustment' then ${t.orderId} is null and ${t.paymentId} is null and ${t.reason} is not null
    end`),
]).enableRLS()
