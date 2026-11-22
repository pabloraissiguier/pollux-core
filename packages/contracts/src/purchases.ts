import { z } from 'zod'
import { cuitSchema } from './cuit'
import { moneySchema } from './money'
import { daySchema } from './orders'
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
  /** Checked for format and check digit; stored as `XX-XXXXXXXX-X`. Empty means none. */
  cuit: z
    .string()
    .trim()
    .transform(v => (v === '' ? null : v))
    .pipe(cuitSchema.nullable())
    .nullish(),
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

/** Costo unitario: what one unit cost on the Supplier's invoice. A decimal string, never negative. */
export const unitCostSchema = moneySchema.refine(v => !v.startsWith('-'), { message: 'El costo no puede ser negativo' })

/** One line of a Purchase: a Product received, how many units and at what unit cost. */
export const purchaseLineSchema = z.object({
  productId: z.uuid({ message: 'Elegí un producto válido' }),
  quantity: z
    .number({ message: 'Ingresá una cantidad' })
    .int('La cantidad debe ser un número entero')
    .min(1, 'La cantidad debe ser mayor a cero'),
  unitCost: unitCostSchema,
})
export type PurchaseLineInput = z.input<typeof purchaseLineSchema>

/**
 * Compra: Products received from a Supplier. Registering it raises each Product's On-hand stock
 * by the line quantities. `purchasedOn` defaults to today (America/Argentina/Cordoba).
 * Purchases can't be edited or deleted.
 */
export const purchaseCreateSchema = z.object({
  supplierId: z.uuid({ message: 'Elegí un proveedor válido' }),
  purchasedOn: daySchema.optional(),
  invoiceNumber: optionalText(50),
  notes: optionalText(1000),
  lines: z.array(purchaseLineSchema).min(1, 'Agregá al menos un producto').max(500),
})
export type PurchaseCreateInput = z.input<typeof purchaseCreateSchema>

/** Purchases by Supplier and by date (`from`/`to`, both inclusive), latest first. */
export const purchaseListQuerySchema = paginationSchema
  .extend({
    supplierId: z.uuid({ message: 'Elegí un proveedor válido' }).optional(),
    from: daySchema.optional(),
    to: daySchema.optional(),
  })
  .refine(q => !q.from || !q.to || q.from <= q.to, {
    message: 'La fecha desde no puede ser posterior a la fecha hasta',
    path: ['to'],
  })
export type PurchaseListQuery = z.input<typeof purchaseListQuerySchema>
