/**
 * How the dashboard shows values to people: es-AR money, dates and CUIT, and the Spanish label
 * of every enum. Pure functions, auto-imported by Nuxt, unit-tested in `test/format.test.ts`.
 */
import type { Money, PaymentMethod, Percent, StockAdjustmentReason, VatCondition } from '@pollux/contracts'

/** Argentina's time zone, for timestamps. Calendar dates (`yyyy-mm-dd`) never go through one. */
export const TIME_ZONE = 'America/Argentina/Buenos_Aires'

const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })

/**
 * `"12345.50"` → `"$ 12.345,50"`. The decimal string goes to Intl as a string, which formats it
 * exactly, so money never passes through a float.
 */
export function formatMoney(value: Money): string {
  return money.format(value as `${number}`)
}

const percent = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 })
/** es-AR puts a non-breaking space before `%`; a code point, so it can't hide in the source. */
const NO_BREAK_SPACE = String.fromCharCode(0xA0)

/**
 * `"10.50"` → `"10,5 %"` (with a non-breaking space, as es-AR writes percentages). For VAT rates
 * and Discounts, which travel as decimal strings; formatted from the string, never a float.
 */
export function formatPercent(value: Percent): string {
  return `${percent.format(value as `${number}`)}${NO_BREAK_SPACE}%`
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const dateInArgentina = new Intl.DateTimeFormat('es-AR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * `dd/mm/yyyy`. A calendar date (`"2026-11-21"`, e.g. a Delivery date) is rearranged as text, so
 * it can't drift a day the way `new Date("2026-11-21")` (midnight UTC) does west of Greenwich.
 * A timestamp (`"2026-11-21T02:30:00Z"`) shows its date in Argentina.
 */
export function formatDate(value: string): string {
  const plain = ISO_DATE.exec(value)
  if (plain) return `${plain[3]}/${plain[2]}/${plain[1]}`

  const instant = new Date(value)
  if (!value.includes('T') || Number.isNaN(instant.getTime())) throw new Error(`Not an ISO date or timestamp: ${value}`)
  return dateInArgentina.format(instant)
}

/** Formats a CUIT as it's typed: digits only, up to 11, shown as `XX-XXXXXXXX-X`. */
export function maskCuit(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11)
  return [digits.slice(0, 2), digits.slice(2, 10), digits.slice(10)].filter(Boolean).join('-')
}

// Enums that only live in the DB schema so far (`@pollux/db`). Moving them to `@pollux/contracts`
// is issue #30; until then, these types must match `db/src/schema`.
export type OrderStatus = 'pending' | 'delivered' | 'cancelled'
export type BalanceEntryType = 'order_delivered' | 'delivery_undone' | 'payment' | 'payment_voided' | 'opening_balance' | 'adjustment'
export type StockMovementType = 'order_delivered' | 'delivery_undone' | 'purchase' | 'adjustment'

/** Medio de pago. "Cuenta corriente" is not one: it means the delivery had no Payment (ADR-0001). */
export const paymentMethodLabels: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  bank_transfer: 'Transferencia',
  check: 'Cheque',
  other: 'Otro'
}

export const vatConditionLabels: Record<VatCondition, string> = {
  responsable_inscripto: 'Responsable Inscripto',
  monotributo: 'Monotributo',
  consumidor_final: 'Consumidor Final',
  exento: 'Exento'
}

export const stockAdjustmentReasonLabels: Record<StockAdjustmentReason, string> = {
  initial_count: 'Conteo inicial',
  count_correction: 'Corrección de conteo',
  breakage: 'Rotura',
  other: 'Otro'
}

export const orderStatusLabels: Record<OrderStatus, string> = {
  pending: 'Pendiente',
  delivered: 'Entregado',
  cancelled: 'Cancelado'
}

export const balanceEntryTypeLabels: Record<BalanceEntryType, string> = {
  order_delivered: 'Entrega de pedido',
  delivery_undone: 'Entrega deshecha',
  payment: 'Pago',
  payment_voided: 'Pago anulado',
  opening_balance: 'Saldo inicial',
  adjustment: 'Ajuste de saldo'
}

export const stockMovementTypeLabels: Record<StockMovementType, string> = {
  order_delivered: 'Entrega de pedido',
  delivery_undone: 'Entrega deshecha',
  purchase: 'Compra',
  adjustment: 'Ajuste de stock'
}
