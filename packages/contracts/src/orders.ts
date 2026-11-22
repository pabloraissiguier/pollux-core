import { z } from 'zod'
import { daySchema } from './day'
import { ORDER_STATUSES } from './enums'
import { applyDiscount, multiplyMoney, percentOf, percentSchema, subtractMoney, sumMoney } from './money'
import type { Money, Percent } from './money'
import { paginationSchema } from './pagination'
import { deliveryPaymentSchema } from './payments'

/** Free notes: trimmed, and an empty string means "none" (stored as null). */
const notes = z
  .string()
  .trim()
  .max(1000)
  .transform(v => (v === '' ? null : v))
  .nullish()

/** A Discount: a percentage between 0 and 100, output with 2 decimals ("10" → "10.00"). */
export const discountPercentSchema = percentSchema.refine(
  // `percentSchema` outputs exactly 2 decimals, so dropping the point gives exact hundredths.
  v => !v.startsWith('-') && BigInt(v.replace('.', '')) <= 10_000n,
  { message: 'Ingresá un descuento entre 0 y 100' },
)

// `daySchema` lives in ./day so ./payments can use it without importing this module.
export { daySchema }
const day = daySchema

/**
 * Línea de pedido. Its unit price is not sent: the API freezes the Product's current Price when
 * the line is added. On edit, `id` names an existing line to keep (with its frozen price); a line
 * without `id` is new.
 */
export const orderLineSchema = z.object({
  id: z.uuid({ message: 'Línea de pedido inválida' }).optional(),
  productId: z.uuid({ message: 'Elegí un producto válido' }),
  quantity: z
    .number({ message: 'Ingresá una cantidad' })
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad debe ser mayor a cero'),
  discountPercent: discountPercentSchema.default('0.00'),
})
export type OrderLineInput = z.input<typeof orderLineSchema>

const orderLines = z
  .array(orderLineSchema)
  .min(1, 'Agregá al menos un producto')
  .max(500, 'Un pedido puede tener hasta 500 líneas')
  .refine(
    lines => new Set(lines.flatMap(l => (l.id ? [l.id] : []))).size === lines.filter(l => l.id).length,
    { message: 'Hay una línea repetida' },
  )

/**
 * Pedido: the same flow for orders taken in the field and by phone. The Branch must be one of
 * the Customer's. The Order Discount applies after the line Discounts.
 */
export const orderCreateSchema = z.object({
  customerId: z.uuid({ message: 'Elegí un cliente válido' }),
  branchId: z.uuid({ message: 'Elegí una sucursal válida' }),
  deliveryDate: day,
  discountPercent: discountPercentSchema.default('0.00'),
  notes,
  lines: orderLines.refine(lines => lines.every(l => !l.id), { message: 'Un pedido nuevo no tiene líneas existentes' }),
})
export type OrderCreateInput = z.input<typeof orderCreateSchema>

/**
 * Edit a Pending Order: send only the fields that change. `lines`, when sent, is the full line
 * list: lines with an `id` are kept (with their frozen price), lines without one are new, and
 * lines left out are removed. The Customer can't change: cancel and create a new Order instead.
 */
export const orderUpdateSchema = z.object({
  customerId: z.never({ message: 'No se puede cambiar el cliente de un pedido: cancelalo y creá uno nuevo' }).optional(),
  branchId: z.uuid({ message: 'Elegí una sucursal válida' }).optional(),
  deliveryDate: day.optional(),
  discountPercent: discountPercentSchema.optional(),
  notes,
  lines: orderLines.optional(),
})
export type OrderUpdateInput = z.input<typeof orderUpdateSchema>

/**
 * Orders for planning the reparto: by status, Delivery date, town (the Branch's city,
 * case-insensitive) and Customer.
 */
export const orderListQuerySchema = paginationSchema.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  deliveryDate: day.optional(),
  town: z.string().trim().min(1).optional(),
  customerId: z.uuid({ message: 'Elegí un cliente válido' }).optional(),
})
export type OrderListQuery = z.input<typeof orderListQuerySchema>

/**
 * Mark a Pending Order Delivered. `deliveredOn` (the Delivered date) defaults to today in
 * America/Argentina/Cordoba. `payment`, when sent, is the money collected at the door, recorded
 * in the same step, noting the Order and dated by the Delivered date; it may be less than, equal
 * to or more than the total. Without it the Order is left "on account".
 */
export const orderDeliverSchema = z.object({
  deliveredOn: day.optional(),
  payment: deliveryPaymentSchema.optional(),
})
export type OrderDeliverInput = z.input<typeof orderDeliverSchema>

/** `quantity × unitPrice × (1 − discountPercent / 100)`, rounded half-up to cents. */
export function lineSubtotal(line: { quantity: number, unitPrice: Money, discountPercent: Percent }): Money {
  return applyDiscount(multiplyMoney(line.unitPrice, line.quantity), line.discountPercent)
}

/**
 * An Order's totals: the subtotal is the sum of the rounded line subtotals, the Order Discount
 * is taken from it and rounded to cents, and the total is what's left.
 */
export function orderTotals(
  lines: readonly { quantity: number, unitPrice: Money, discountPercent: Percent }[],
  discountPercent: Percent,
): { subtotal: Money, discountAmount: Money, total: Money } {
  const subtotal = sumMoney(lines.map(lineSubtotal))
  const discountAmount = percentOf(subtotal, discountPercent)
  return { subtotal, discountAmount, total: subtractMoney(subtotal, discountAmount) }
}
