import { z } from 'zod'
import { STOCK_ADJUSTMENT_REASONS } from './enums'
import { paginationSchema } from './pagination'

/** Free notes: trimmed, and an empty string means "none" (stored as null). */
const notes = z
  .string()
  .trim()
  .max(500)
  .transform(v => (v === '' ? null : v))
  .nullish()

const productId = z.uuid({ message: 'Elegí un producto válido' })

/** A whole number of units of a Product. */
const units = z.number({ message: 'Ingresá una cantidad' }).int('La cantidad debe ser un número entero')

/**
 * Ajuste de stock: a manual change to a Product's On-hand stock. `quantity` is signed (positive
 * adds units, negative removes them) and never zero. On-hand stock may end up negative.
 */
export const stockAdjustmentSchema = z.object({
  productId,
  quantity: units.refine(v => v !== 0, { message: 'La cantidad no puede ser cero' }),
  reason: z.enum(STOCK_ADJUSTMENT_REASONS, { message: 'Elegí un motivo' }),
  notes,
})
export type StockAdjustmentInput = z.input<typeof stockAdjustmentSchema>

/**
 * Bulk initial count: each listed Product's On-hand stock is set to its counted quantity (an
 * `initial_count` Stock adjustment for the difference; none when it already matches).
 */
export const initialCountSchema = z.object({
  items: z
    .array(z.object({
      productId,
      quantity: units.min(0, 'La cantidad contada no puede ser negativa'),
    }))
    .min(1, 'Ingresá al menos un producto')
    .max(1000, 'Ingresá hasta 1000 productos por vez')
    .refine(items => new Set(items.map(i => i.productId)).size === items.length, {
      message: 'Hay un producto repetido',
    }),
})
export type InitialCountInput = z.input<typeof initialCountSchema>

/** A Product's Stock movements, newest first. */
export const stockMovementListQuerySchema = paginationSchema.extend({
  productId,
})
export type StockMovementListQuery = z.input<typeof stockMovementListQuerySchema>
