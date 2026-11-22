import { z } from 'zod'
import { optionalCuitSchema } from './cuit'
import { paginationSchema } from './pagination'

/** Optional free text: trimmed, and an empty string means "none" (stored as null). */
const optionalText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .transform(v => (v === '' ? null : v))
  .nullish()

const supplierFields = z.object({
  name: z.string().trim().min(1, 'Ingresá el nombre').max(200),
  cuit: optionalCuitSchema,
  phone: optionalText(50),
  notes: optionalText(1000),
})

/** Proveedor: a business the distributor buys Products from. */
export const supplierCreateSchema = supplierFields
export type SupplierCreateInput = z.input<typeof supplierCreateSchema>

/** Edit a Supplier: send only the fields that change; `null` clears an optional one. */
export const supplierUpdateSchema = supplierFields.partial()
export type SupplierUpdateInput = z.input<typeof supplierUpdateSchema>

/** Search Suppliers by name or CUIT (`q`, with or without dashes). */
export const supplierListQuerySchema = paginationSchema.extend({
  q: z.string().trim().optional(),
})
export type SupplierListQuery = z.input<typeof supplierListQuerySchema>
