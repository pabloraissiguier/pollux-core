import { categoryPriceUpdateSchema, percentSchema, priceSchema, productCreateSchema, productUpdateSchema } from '@pollux/contracts'
import type { InferResponseType } from 'hono/client'
import { z } from 'zod'
import type { ApiClient } from '~/composables/useApi'

/** A Product as the API returns it, with its Category as `{ id, name }` or null. */
export type Product = InferResponseType<ApiClient['products'][':id']['$get'], 200>
export type Category = InferResponseType<ApiClient['categories']['$get'], 200>['items'][number]
export type PriceChange = InferResponseType<ApiClient['products'][':id']['price-history']['$get'], 200>['items'][number]
/** What a Category Price update changes (or would change): the Category, the percent and each Active Product. */
export type CategoryPriceUpdatePlan = InferResponseType<ApiClient['categories'][':id']['price-update']['preview']['$post'], 200>

/**
 * A Price as typed in es-AR ("1.234,50", "1234,50") or with a point ("1234.50"), turned into the
 * decimal string the API takes before the shared schema checks it.
 */
export const priceInputSchema = z
  .string()
  .trim()
  .min(1, 'Ingresá el precio')
  .transform(parseDecimalInput)
  .pipe(priceSchema)

/** The new-Product form: the API's schema, with the Price typed the es-AR way. */
export const productCreateFormSchema = productCreateSchema.extend({ price: priceInputSchema })

/** The edit form leaves the Price out: changing it is its own action, kept in the history. */
export const productEditFormSchema = productUpdateSchema.omit({ price: true, isActive: true })

/** The Price change form. */
export const priceChangeFormSchema = z.object({ price: priceInputSchema })

/**
 * The Category Price update form. The owner picks "Aumento" or "Rebaja" and types the percent
 * without a sign (phone keyboards with `inputmode="decimal"` often have no minus key); the output
 * is the signed percent the API takes, checked against the API's own limits.
 */
export const priceUpdateDirectionSchema = z.enum(['up', 'down'])
/** "Aumento" (`up`) or "Rebaja" (`down`): the sign of a Category Price update's percent. */
export type PriceUpdateDirection = z.infer<typeof priceUpdateDirectionSchema>

export const categoryPriceUpdateFormSchema = z
  .object({
    categoryId: z.uuid({ error: 'Elegí una categoría' }),
    direction: priceUpdateDirectionSchema,
    percent: z
      .string()
      .trim()
      .min(1, 'Ingresá el porcentaje')
      .transform(parseDecimalInput)
      .pipe(percentSchema)
      .refine(value => !value.startsWith('-'), 'Ingresá el porcentaje sin signo y elegí Aumento o Rebaja')
  })
  .transform(({ categoryId, direction, percent }, ctx) => {
    const parsed = categoryPriceUpdateSchema.safeParse({ percent: direction === 'down' ? `-${percent}` : percent })
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: ['percent'] })
      return z.NEVER
    }
    return { categoryId, percent: parsed.data.percent }
  })

/** The fields of the Product form, as typed. */
export interface ProductFormState {
  code: string
  name: string
  brand: string
  /** null is "Sin categoría", sent as null so an edit takes the Product out of its Category. */
  categoryId: string | null
  price: string
  vatRate: string
}

export function productFormState(product?: Product): ProductFormState {
  return {
    code: product?.code ?? '',
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    categoryId: product?.category?.id ?? null,
    price: product ? priceForInput(product.price) : '',
    vatRate: product?.vatRate ?? '21.00'
  }
}

/** `"1234.50"` → `"1234,50"`: a stored Price ready to edit, written the es-AR way. */
export function priceForInput(price: string): string {
  return price.replace('.', ',')
}

/** Argentina's VAT rates; 21% is the general one. */
const VAT_RATES = ['21.00', '10.50', '27.00', '5.00', '2.50', '0.00']

/** The VAT rate choices, plus `current` when a Product has a rate outside the usual ones. */
export function vatRateItems(current?: string) {
  const rates = current && !VAT_RATES.includes(current) ? [...VAT_RATES, current] : VAT_RATES
  return rates.map(rate => ({ label: formatPercent(rate), value: rate }))
}
