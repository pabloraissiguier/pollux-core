import { STOCK_ADJUSTMENT_REASONS, stockAdjustmentSchema } from '@pollux/contracts'
import type { InferResponseType } from 'hono/client'
import { z } from 'zod'
import type { ApiClient } from '~/composables/useApi'

/** A Stock movement as the API lists it, with its cause (adjustment reason, Order or Purchase). */
export type StockMovement = InferResponseType<ApiClient['stock']['movements']['$get'], 200>['items'][number]

/**
 * A count of units as typed on a phone's numeric keypad: digits only, with optional `.` for
 * thousands (`"1.200"`). The keypad has no minus sign, so a direction is chosen apart.
 */
const NOT_WHOLE_UNITS = 'Ingresá un número entero, sin signo ni decimales'

export const unitsInputSchema = z
  .string()
  .trim()
  .min(1, 'Ingresá una cantidad')
  .transform(v => v.replace(/\./g, ''))
  .pipe(z.string().regex(/^\d+$/, NOT_WHOLE_UNITS))
  .transform(Number)

/** Whether a Stock adjustment adds units to On-hand stock or takes them out. */
export const adjustmentDirectionSchema = z.enum(['add', 'remove'])
export type AdjustmentDirection = z.infer<typeof adjustmentDirectionSchema>

/** The signed quantity the API takes: units taken out are negative. */
export function signedUnits(direction: AdjustmentDirection, quantity: number): number {
  return direction === 'add' ? quantity : -quantity
}

/**
 * The "Ajustar stock" form: a direction plus a positive quantity, which together make the
 * signed quantity the API takes. Reason and notes are the shared schema's own.
 */
export const stockAdjustmentFormSchema = z.object({
  direction: adjustmentDirectionSchema,
  quantity: unitsInputSchema.pipe(z.number().min(1, 'La cantidad debe ser mayor que cero')),
  reason: stockAdjustmentSchema.shape.reason,
  notes: stockAdjustmentSchema.shape.notes
}).refine(form => !(form.reason === 'breakage' && form.direction === 'add'), {
  path: ['direction'],
  message: 'Una rotura solo resta unidades'
})

export interface StockAdjustmentFormState {
  direction: AdjustmentDirection
  quantity: string
  reason: (typeof STOCK_ADJUSTMENT_REASONS)[number] | undefined
  notes: string
}

export function stockAdjustmentFormState(): StockAdjustmentFormState {
  return { direction: 'add', quantity: '', reason: undefined, notes: '' }
}

export const stockAdjustmentReasonItems = STOCK_ADJUSTMENT_REASONS.map(value => ({
  value,
  label: stockAdjustmentReasonLabels[value]
}))

/**
 * The initial count form: one typed count per Product id. A blank count means "not counted" and
 * is left out; the rest go to the API as `{ productId, quantity }` in one request.
 */
export const initialCountFormSchema = z
  .object({
    counts: z.record(z.string(), z.string().refine(
      v => v.trim() === '' || unitsInputSchema.safeParse(v).success,
      NOT_WHOLE_UNITS
    ))
  })
  .transform(({ counts }) => Object.entries(counts)
    .filter(([, typed]) => typed.trim() !== '')
    .map(([productId, typed]) => ({ productId, quantity: unitsInputSchema.parse(typed) })))

/** How many Products have a count typed in. */
export function typedCountTotal(counts: Record<string, string>): number {
  return Object.values(counts).filter(v => v.trim() !== '').length
}

/** What caused a Stock movement, in words: "Ajuste de stock · Rotura", "Entrega de pedido N° 12". */
export function movementCause(movement: StockMovement): string {
  const type = stockMovementTypeLabels[movement.type]
  if (movement.type === 'adjustment' && movement.reason) return `${type} · ${stockAdjustmentReasonLabels[movement.reason]}`
  if (movement.order) return `${type} N° ${formatUnits(movement.order.number)}`
  if (movement.purchase?.invoiceNumber) return `${type} · Factura ${movement.purchase.invoiceNumber}`
  return type
}
