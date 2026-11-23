import { addMoney, balanceAdjustmentSchema, openingBalanceSchema } from '@pollux/contracts'
import type { BalanceEntryType, Money, PaymentMethod } from '@pollux/contracts'
import type { InferResponseType } from 'hono/client'
import { z } from 'zod'
import type { ApiClient } from '~/composables/useApi'
import { balanceEntryTypeLabels, formatMoney, todayInArgentina } from './format'
import { paymentAmountInputSchema } from './payments'

/** A Customer's Balance as the API returns it: `{ customer, balance }`. */
export type CustomerBalance = InferResponseType<ApiClient['customers'][':id']['balance']['$get'], 200>
/** One page of a Customer's Statement. */
export type Statement = InferResponseType<ApiClient['customers'][':id']['statement']['$get'], 200>
export type StatementEntry = Statement['items'][number]

/** What naming a Statement entry needs. */
export interface StatementEntryLabelInput {
  type: BalanceEntryType
  reason: string | null
  order: { id: string, number: number } | null
  payment: { id: string, method: PaymentMethod } | null
}

/**
 * How a Payment reads as a Statement entry: "Pago en efectivo". A sentence, not the method's name
 * (`paymentMethodLabels` in `format.ts`), so it lives with the Statement.
 */
export const statementPaymentLabels: Record<PaymentMethod, string> = {
  cash: 'Pago en efectivo',
  bank_transfer: 'Pago por transferencia',
  check: 'Pago con cheque',
  other: 'Pago (otro medio)'
}

/**
 * A Statement entry in plain Spanish, the way the owner explains it to a Customer: "Entrega
 * pedido N° 123", "Pago en efectivo", "Ajuste: motivo". Without the Order, Payment or reason it
 * needs, it falls back to the entry type's name.
 */
export function statementEntryLabel(entry: StatementEntryLabelInput): string {
  switch (entry.type) {
    case 'order_delivered':
      return entry.order ? `Entrega pedido N° ${entry.order.number}` : balanceEntryTypeLabels.order_delivered
    case 'delivery_undone':
      return entry.order ? `Entrega deshecha, pedido N° ${entry.order.number}` : balanceEntryTypeLabels.delivery_undone
    case 'payment':
      return entry.payment ? statementPaymentLabels[entry.payment.method] : balanceEntryTypeLabels.payment
    case 'adjustment':
      return entry.reason ? `Ajuste: ${entry.reason}` : balanceEntryTypeLabels.adjustment
    default:
      return balanceEntryTypeLabels[entry.type]
  }
}

/**
 * Which column of the Statement an entry goes in, and its amount there without a sign: what the
 * Customer owes more is debe, what they owe less is haber.
 */
export function debitOrCredit(amount: Money): { side: 'debit' | 'credit', amount: Money } {
  return amount.startsWith('-') ? { side: 'credit', amount: amount.slice(1) } : { side: 'debit', amount }
}

/** A Statement amount in its column, in words: "Debe $ 500,00", "Haber $ 100,00". */
export function statementAmountText(amount: Money): string {
  const { side, amount: unsigned } = debitOrCredit(amount)
  return `${side === 'debit' ? 'Debe' : 'Haber'} ${formatMoney(unsigned)}`
}

/** A Balance in a list, in words: "Debe $ 1.500,00", "A favor $ 300,00", "Al día". */
export function balanceAmountText(balance: Money): string {
  if (balance === '0.00') return 'Al día'
  const { side, amount } = debitOrCredit(balance)
  return `${side === 'debit' ? 'Debe' : 'A favor'} ${formatMoney(amount)}`
}

/** What a Balance means, in words, so it never rests on color: "Debe", "A favor del cliente", "Al día". */
export function balanceCaption(balance: Money): string {
  if (balance === '0.00') return 'Al día'
  return debitOrCredit(balance).side === 'debit' ? 'Debe' : 'A favor del cliente'
}

/**
 * Which way a manual entry moves the Balance: `debit` the Customer owes more, `credit` less. A
 * phone's decimal keypad has no minus sign, so the amount is typed without one and the side is
 * chosen apart.
 */
/** A manual Balance entry: the Opening balance or a Balance adjustment. */
export type BalanceEntryKind = 'opening' | 'adjustment'

export const balanceSideSchema = z.enum(['debit', 'credit'])
export type BalanceSide = z.infer<typeof balanceSideSchema>

/** The signed amount the API takes: a credit is negative. */
export function signedBalanceAmount(side: BalanceSide, amount: Money): Money {
  return side === 'debit' ? amount : `-${amount}`
}

/** The Balance after a manual entry, while it's typed; `null` until the amount is valid. */
export function balanceAfter(balance: Money, side: BalanceSide, amountInput: string): Money | null {
  const amount = paymentAmountInputSchema.safeParse(amountInput)
  return amount.success ? addMoney(balance, signedBalanceAmount(side, amount.data)) : null
}

/**
 * The "Saldo inicial" form: what the Customer owed (or had in their favor) before the app, and
 * the day it was taken, never in the future (the API's own rule and words).
 */
export const openingBalanceFormSchema = z.object({
  side: balanceSideSchema,
  amount: paymentAmountInputSchema,
  entryDate: openingBalanceSchema.shape.entryDate
})

/**
 * The "Ajustar saldo" form: a side, an amount, the required reason and its day, required here (the
 * form starts at today) and never in the future (the API's own rule and words).
 */
export const balanceAdjustmentFormSchema = z.object({
  side: balanceSideSchema,
  amount: paymentAmountInputSchema,
  reason: balanceAdjustmentSchema.shape.reason,
  entryDate: balanceAdjustmentSchema.shape.entryDate.unwrap()
})

export interface ManualEntryFormState {
  side: BalanceSide
  amount: string
  reason: string
  entryDate: string
}

/** A fresh manual-entry form: the given side, no amount, dated today. */
export function manualEntryFormState(side: BalanceSide): ManualEntryFormState {
  return { side, amount: '', reason: '', entryDate: todayInArgentina() }
}
