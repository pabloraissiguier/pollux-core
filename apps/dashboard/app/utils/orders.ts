import { discountPercentSchema, lineSubtotal, orderCreateSchema, orderLineSchema, orderTotals } from '@pollux/contracts'
import type { Money, OrderStatus } from '@pollux/contracts'
import type { InferResponseType } from 'hono/client'
import { z } from 'zod'
import type { ApiClient } from '~/composables/useApi'
import { parseDecimalInput, TIME_ZONE } from './format'

/** An Order as the API returns it: Customer, Branch, lines with frozen prices, and totals. */
export type Order = InferResponseType<ApiClient['orders'][':id']['$get'], 200>
/** An Order in a list: the same as the detail, without its Payments. */
export type OrderListItem = InferResponseType<ApiClient['orders']['$get'], 200>['items'][number]
/** An Order right after saving it, with a warning per line left with negative Available stock. */
export type SavedOrder = InferResponseType<ApiClient['orders']['$post'], 201>
export type StockWarning = SavedOrder['warnings'][number]

/** The Product a line is for, with what the form shows about it. */
export interface LineProduct {
  id: string
  code: string
  name: string
}

/**
 * A line of the Order form. `unitPrice` is the frozen price of a kept line, or the Product's
 * current Price for a new one (the API freezes it on save). `available` is the Product's
 * Available stock when it was picked, before this line: unknown for kept lines.
 */
export interface OrderFormLine {
  /** A kept line's id. New lines have none. */
  id?: string
  productId: string
  product: LineProduct
  unitPrice: Money
  quantity: number
  /** The quantity this Order already reserved (kept lines), which Available stock already counts. */
  reservedByOrder: number
  available: number | null
  discountPercent: string
}

export interface OrderFormState {
  customerId: string | undefined
  branchId: string | undefined
  deliveryDate: string
  discountPercent: string
  notes: string
  lines: OrderFormLine[]
}

/**
 * A Discount as typed on a phone: blank is none, `10,5` and `10.5` are the same. The output is
 * the API's decimal string, checked against the API's own limits.
 */
export const discountInputSchema = z
  .string()
  .trim()
  .transform(v => (v === '' ? '0' : parseDecimalInput(v)))
  .pipe(discountPercentSchema)

/**
 * The Order form, shared by new and edit. Its output is what the API takes: for a new Order as
 * is, for an edit without `customerId` (a Customer never changes). Line fields the API doesn't
 * take (name, price, stock) are dropped.
 */
export const orderFormSchema = z.object({
  customerId: z.uuid({ error: 'Elegí un cliente' }),
  branchId: z.uuid({ error: 'Elegí una sucursal' }),
  deliveryDate: z.iso.date({ error: 'Elegí la fecha de entrega' }),
  discountPercent: discountInputSchema,
  notes: orderCreateSchema.shape.notes,
  lines: z
    .array(z.object({
      id: z.uuid().optional(),
      productId: z.uuid(),
      quantity: orderLineSchema.shape.quantity,
      discountPercent: discountInputSchema
    }))
    .min(1, 'Agregá al menos un producto')
})
export type OrderFormOutput = z.output<typeof orderFormSchema>

/** No Discount, as the API writes it. */
const NO_DISCOUNT = '0.00'

/** Whether a stored Discount (`"10.00"`) takes anything off. */
export function hasDiscount(percent: string): boolean {
  return percent !== NO_DISCOUNT
}

/** A typed Discount as the API's decimal string, or none while it's still invalid. */
function discountOrNone(typed: string): string {
  const parsed = discountInputSchema.safeParse(typed)
  return parsed.success ? parsed.data : NO_DISCOUNT
}

/** A stepper's quantity, or 0 while it's empty or half typed. */
export function typedQuantity(quantity: number): number {
  return Number.isInteger(quantity) && quantity > 0 ? quantity : 0
}

function lineForTotals(line: OrderFormLine) {
  return { quantity: typedQuantity(line.quantity), unitPrice: line.unitPrice, discountPercent: discountOrNone(line.discountPercent) }
}

/** A line's subtotal while typing, after its own Discount. */
export function lineFormSubtotal(line: OrderFormLine): Money {
  return lineSubtotal(lineForTotals(line))
}

/**
 * The live totals while typing, with the same arithmetic the API uses. A quantity or Discount
 * still being typed counts as none; the API's figures on save are the authority.
 */
export function orderFormTotals(state: Pick<OrderFormState, 'lines' | 'discountPercent'>) {
  return orderTotals(state.lines.map(lineForTotals), discountOrNone(state.discountPercent))
}

/**
 * The Available stock a line would leave, when known: what was available when the Product was
 * picked, minus what this line adds on top of what the Order already reserved.
 */
export function availableAfter(line: OrderFormLine): number | null {
  if (line.available === null) return null
  return line.available - (line.quantity - line.reservedByOrder)
}

/** `"10.00"` → `"10"`, a stored Discount ready to edit, written the es-AR way. */
export function discountForInput(percent: string): string {
  return !hasDiscount(percent) ? '' : percent.replace(/\.?0+$/, '').replace('.', ',')
}

/**
 * The form for editing a saved Order: its lines are kept, with their frozen prices. `available`
 * is each Product's Available stock now, which already counts what this Order reserved.
 */
export function orderFormStateFrom(order: Order, available: Record<string, number> = {}): OrderFormState {
  return {
    customerId: order.customer.id,
    branchId: order.branch.id,
    deliveryDate: order.deliveryDate,
    discountPercent: discountForInput(order.discountPercent),
    notes: order.notes ?? '',
    lines: order.lines.map(line => ({
      id: line.id,
      productId: line.product.id,
      product: line.product,
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      reservedByOrder: line.quantity,
      available: available[line.product.id] ?? null,
      discountPercent: discountForInput(line.discountPercent)
    }))
  }
}

/**
 * Tomorrow's date in Argentina as `yyyy-mm-dd`: the default Delivery date (preventa today, reparto
 * tomorrow). Today is read in Argentina's time zone; the day after is plain calendar arithmetic
 * on a UTC date, which has no daylight saving or offset to drift through.
 */
export function tomorrowInArgentina(now: Date = new Date()): string {
  // en-CA writes dates as yyyy-mm-dd.
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  const [year, month, day] = today.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10)
}

export const orderStatusColors: Record<OrderStatus, 'warning' | 'success' | 'neutral'> = {
  pending: 'warning',
  delivered: 'success',
  cancelled: 'neutral'
}
