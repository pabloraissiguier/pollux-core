import { z } from 'zod'
import { moneySchema } from './money'
import { daySchema } from './orders'
import { paginationSchema } from './pagination'

/**
 * A Customer's statement (resumen de cuenta): their Balance entries in date order, optionally
 * from and/or to a day (both inclusive).
 */
export const customerStatementQuerySchema = paginationSchema
  .extend({
    from: daySchema.optional(),
    to: daySchema.optional(),
  })
  .refine(q => !q.from || !q.to || q.from <= q.to, {
    message: 'La fecha desde no puede ser posterior a la fecha hasta',
    path: ['to'],
  })
export type CustomerStatementQuery = z.input<typeof customerStatementQuerySchema>

/** A signed amount on the Balance: positive the Customer owes more, negative they owe less. Never 0. */
const signedAmount = moneySchema.refine(v => v !== '0.00', { message: 'El importe no puede ser cero' })

/**
 * Saldo inicial: the Balance a Customer carried over from before the app (e.g. the Excel sheet),
 * on the day it was taken. Positive is a debt, negative a credit in the Customer's favor.
 * Entered once per Customer.
 */
export const openingBalanceSchema = z.object({
  amount: signedAmount,
  entryDate: daySchema,
})
export type OpeningBalanceInput = z.input<typeof openingBalanceSchema>

/**
 * Ajuste de saldo: a manual change to a Customer's Balance with a required reason, such as
 * writing off a bad debt (negative) or fixing a carried-over mistake. `entryDate` defaults to
 * today.
 */
export const balanceAdjustmentSchema = z.object({
  amount: signedAmount,
  reason: z.string().trim().min(1, 'Ingresá el motivo del ajuste').max(500),
  entryDate: daySchema.optional(),
})
export type BalanceAdjustmentInput = z.input<typeof balanceAdjustmentSchema>

/** Customers with a Balance: every Customer whose Balance isn't zero, largest first. */
export const customersWithBalanceQuerySchema = paginationSchema
export type CustomersWithBalanceQuery = z.input<typeof customersWithBalanceQuerySchema>
