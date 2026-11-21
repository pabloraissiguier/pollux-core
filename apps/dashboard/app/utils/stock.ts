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
export const unitsInputSchema = z
  .string()
  .trim()
  .min(1, 'Ingresá una cantidad')
  .transform(v => v.replace(/\./g, ''))
  .pipe(z.string().regex(/^\d+$/, 'Ingresá un número entero, sin signo ni decimales'))
  .transform(Number)

/** Whether a Stock adjustment adds units to On-hand stock or takes them out. */
export type AdjustmentDirection = 'add' | 'remove'

/**
 * The "Ajustar stock" form: a direction plus a positive quantity, which together make the
 * signed quantity the API takes. Reason and notes are the shared schema's own.
 */
export const stockAdjustmentFormSchema = z.object({
  direction: z.enum(['add', 'remove']),
  quantity: unitsInputSchema.pipe(z.number().min(1, 'La cantidad debe ser mayor que cero')),
  reason: stockAdjustmentSchema.shape.reason,
  notes: stockAdjustmentSchema.shape.notes
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

/** What caused a Stock movement, in words: "Ajuste de stock · Rotura", "Entrega de pedido N° 12". */
export function movementCause(movement: StockMovement): string {
  const type = stockMovementTypeLabels[movement.type]
  if (movement.type === 'adjustment' && movement.reason) return `${type} · ${stockAdjustmentReasonLabels[movement.reason]}`
  if (movement.order) return `${type} N° ${movement.order.number}`
  if (movement.purchase?.invoiceNumber) return `${type} · Factura ${movement.purchase.invoiceNumber}`
  return type
}
