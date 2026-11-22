import { daySchema, multiplyMoney, purchaseCreateSchema, purchaseLineSchema, sumMoney, unitCostSchema } from '@pollux/contracts'
import type { InferResponseType } from 'hono/client'
import { z } from 'zod'
import type { ApiClient } from '~/composables/useApi'
import type { Product } from '~/utils/products'
import { unitsInputSchema } from '~/utils/stock'

/** A Supplier as the API returns it. */
export type Supplier = InferResponseType<ApiClient['suppliers'][':id']['$get'], 200>
/** A Purchase with its Supplier as `{ id, name }`, its lines (with subtotals) and its total. */
export type Purchase = InferResponseType<ApiClient['purchases'][':id']['$get'], 200>

/** The fields of the Supplier form, as typed (the shared schema trims and turns '' into null). */
export interface SupplierFormState {
  name: string
  cuit: string
  phone: string
  notes: string
}

export function supplierFormState(supplier?: Supplier | null): SupplierFormState {
  return {
    name: supplier?.name ?? '',
    cuit: supplier?.cuit ?? '',
    phone: supplier?.phone ?? '',
    notes: supplier?.notes ?? ''
  }
}

/** A unit cost as typed in es-AR ("1.234,50") or with a point, checked by the API's own schema. */
export const unitCostInputSchema = z
  .string()
  .trim()
  .min(1, 'Ingresá el costo')
  .transform(parseDecimalInput)
  .pipe(unitCostSchema)

/** One line of the new-Purchase form: the Product picked, and its quantity and unit cost as typed. */
export interface PurchaseLineFormState {
  /** Tells apart two lines of the same Product (they may come at different costs). */
  key: number
  product: Pick<Product, 'id' | 'code' | 'name'>
  quantity: string
  unitCost: string
}

export interface PurchaseFormState {
  supplierId: string | undefined
  purchasedOn: string
  invoiceNumber: string
  notes: string
  lines: PurchaseLineFormState[]
}

export function purchaseFormState(): PurchaseFormState {
  return { supplierId: undefined, purchasedOn: todayInArgentina(), invoiceNumber: '', notes: '', lines: [] }
}

/**
 * The new-Purchase form: what the API takes, with quantities typed as whole units ("1.200") and
 * unit costs typed the es-AR way. Its output is the body of `POST /purchases`.
 */
export const purchaseFormSchema = z.object({
  supplierId: z.uuid({ error: 'Elegí un proveedor' }),
  purchasedOn: daySchema,
  invoiceNumber: purchaseCreateSchema.shape.invoiceNumber,
  notes: purchaseCreateSchema.shape.notes,
  lines: z
    .array(z
      .object({
        product: z.object({ id: z.string() }),
        quantity: unitsInputSchema.pipe(purchaseLineSchema.shape.quantity),
        unitCost: unitCostInputSchema
      })
      .transform(line => ({ productId: line.product.id, quantity: line.quantity, unitCost: line.unitCost })))
    .min(1, 'Agregá al menos un producto')
})

/** A line's subtotal while typing, or null until its quantity and unit cost are both valid. */
export function purchaseLineSubtotal(line: Pick<PurchaseLineFormState, 'quantity' | 'unitCost'>): string | null {
  const quantity = unitsInputSchema.safeParse(line.quantity)
  const unitCost = unitCostInputSchema.safeParse(line.unitCost)
  return quantity.success && unitCost.success ? multiplyMoney(unitCost.data, quantity.data) : null
}

/** The live total of the form: the lines typed so far (an incomplete line counts as nothing). */
export function purchaseFormTotal(lines: PurchaseLineFormState[]): string {
  return sumMoney(lines.map(line => purchaseLineSubtotal(line) ?? '0'))
}
