import { z } from 'zod'
import { moneySchema } from './money'
import { paginationSchema } from './pagination'

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max)

/** Optional free text: trimmed, and an empty string means "none" (stored as null). */
const optionalText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .transform(v => (v === '' ? null : v))
  .nullish()

/** Categoría: a single-level group of Products. Its name is unique within the business. */
export const categorySchema = z.object({
  name: requiredText(120, 'Ingresá el nombre'),
})
export type CategoryInput = z.input<typeof categorySchema>

export const categoryListQuerySchema = paginationSchema
export type CategoryListQuery = z.input<typeof categoryListQuerySchema>

/** Precio: final, VAT included (docs/adr/0003). A decimal string, never negative. */
export const priceSchema = moneySchema.refine(v => !v.startsWith('-'), { message: 'El precio no puede ser negativo' })

/** Alícuota de IVA: a percentage between 0 and 100, as a decimal string ("21.00", "10.50"). */
export const vatRateSchema = moneySchema.refine(
  v => !v.startsWith('-') && Number(v) <= 100,
  { message: 'Ingresá una alícuota entre 0 y 100' },
)

const productFields = z.object({
  /** Código: the business's own identifier, unique within the business. */
  code: requiredText(50, 'Ingresá el código'),
  name: requiredText(200, 'Ingresá el nombre'),
  brand: optionalText(120),
  categoryId: z.uuid({ message: 'Elegí una categoría válida' }).nullish(),
  price: priceSchema,
  vatRate: vatRateSchema,
})

/** Producto. A new Product is Active, and its VAT rate defaults to 21%. */
export const productCreateSchema = productFields.extend({
  vatRate: vatRateSchema.default('21.00'),
})
export type ProductCreateInput = z.input<typeof productCreateSchema>

/**
 * Edit a Product: send only the fields that change; `null` clears an optional one.
 * A new `price` is a Price change and is kept in the price history. `isActive: false` makes the
 * Product Inactive (nothing is ever deleted); `true` reactivates it.
 */
export const productUpdateSchema = productFields.partial().extend({
  isActive: z.boolean().optional(),
})
export type ProductUpdateInput = z.input<typeof productUpdateSchema>

/**
 * Search by name, Code or Brand (`q`), and filter by Category and by Active status
 * (`active=true` or `false`; left out, both).
 */
export const productListQuerySchema = paginationSchema.extend({
  q: z.string().trim().optional(),
  categoryId: z.uuid({ message: 'Elegí una categoría válida' }).optional(),
  active: z.stringbool().optional(),
})
export type ProductListQuery = z.input<typeof productListQuerySchema>

export const priceHistoryQuerySchema = paginationSchema
export type PriceHistoryQuery = z.input<typeof priceHistoryQuerySchema>
