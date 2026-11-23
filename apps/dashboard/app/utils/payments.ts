import { orderDeliverSchema, PAYMENT_METHODS, paymentAmountSchema, paymentCreateSchema } from '@pollux/contracts'
import type { PaymentMethod } from '@pollux/contracts'
import type { InferResponseType } from 'hono/client'
import { z } from 'zod'
import type { ApiClient } from '~/composables/useApi'
import { parseDecimalInput } from './format'

/** A Payment as the API returns it; a voided one keeps `voidedAt` and `voidReason`. */
export type Payment = InferResponseType<ApiClient['payments'][':id']['$get'], 200>

/**
 * What the Payment sheet offers: a Payment method, or (only when delivering) `noPayment`,
 * shown as "Cuenta corriente (sin pago)": no Payment at all, so not a method (ADR-0001).
 */
export type PaymentChoice = PaymentMethod | 'noPayment'

/** An amount typed the es-AR way ("1.234,50"), checked by the API's own Payment amount schema. */
export const paymentAmountInputSchema = z
  .string()
  .trim()
  .min(1, 'Ingresá el importe')
  .transform(parseDecimalInput)
  .pipe(paymentAmountSchema)

/**
 * The Payment sheet's form: the choice, the amount and reference (asked only for a Payment) and
 * the day: the Delivered date when `delivering`, else the Payment date. Outputs the day plus the
 * Payment to record, or `null` for "Cuenta corriente (sin pago)".
 */
export function paymentFormSchema(delivering: boolean) {
  return paymentFormFields(delivering).transform(({ choice, amount, reference, day }, ctx) => {
    if (choice === 'noPayment') return { day, payment: null }
    const parsed = paymentAmountInputSchema.safeParse(amount)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) ctx.addIssue({ code: 'custom', message: issue.message, path: ['amount'] })
      return z.NEVER
    }
    return { day, payment: { method: choice, amount: parsed.data, reference: reference || null } }
  })
}
export type PaymentFormOutput = z.output<ReturnType<typeof paymentFormSchema>>

/**
 * The day fields exactly as the API checks them (`@pollux/contracts`): never later than today in
 * Córdoba, with the Spanish message of each. Required here, since the sheet always sends a day.
 */
const deliveredOnSchema = orderDeliverSchema.shape.deliveredOn.unwrap()
const paidOnSchema = paymentCreateSchema.shape.paidOn.unwrap()

function paymentFormFields(delivering: boolean) {
  return z.object({
    choice: z.enum(['noPayment', ...PAYMENT_METHODS], { message: 'Elegí un medio de pago' }),
    amount: z.string(),
    reference: z.string().trim().max(200),
    day: delivering ? deliveredOnSchema : paidOnSchema
  })
}
