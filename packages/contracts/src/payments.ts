import { z } from 'zod'
import { daySchema } from './day'
import { PAYMENT_METHODS } from './enums'
import { moneySchema } from './money'
import { paginationSchema } from './pagination'

/** A Payment amount: above zero, and within `numeric(14,2)`. */
export const paymentAmountSchema = moneySchema.refine(
  // `moneySchema` outputs exactly 2 decimals, so dropping the point gives exact hundredths.
  (v) => {
    const hundredths = BigInt(v.replace('.', ''))
    return hundredths > 0n && hundredths < 10n ** 14n
  },
  { message: 'Ingresá un importe mayor a cero' },
)

/** Medio de pago. "On account" is not one: it means no Payment was recorded. */
export const paymentMethodSchema = z.enum(PAYMENT_METHODS, { message: 'Elegí un medio de pago' })

/** Optional reference (a transfer or check number): trimmed, and an empty string means "none". */
const reference = z
  .string()
  .trim()
  .max(200)
  .transform(v => (v === '' ? null : v))
  .nullish()

/** The money collected when delivering an Order. It is dated by the Delivered date. */
export const deliveryPaymentSchema = z.object({
  amount: paymentAmountSchema,
  method: paymentMethodSchema,
  reference,
})
export type DeliveryPaymentInput = z.input<typeof deliveryPaymentSchema>

/**
 * Pago: money a Customer hands over. `paidOn` defaults to today in America/Argentina/Cordoba.
 * `orderId` optionally notes the Order it was collected with (same Customer), for history only:
 * the Payment lowers the Balance as a whole.
 */
export const paymentCreateSchema = deliveryPaymentSchema.extend({
  customerId: z.uuid({ message: 'Elegí un cliente válido' }),
  orderId: z.uuid({ message: 'Elegí un pedido válido' }).nullish(),
  paidOn: daySchema.optional(),
})
export type PaymentCreateInput = z.input<typeof paymentCreateSchema>

/** Anular pago: the reason is required. */
export const paymentVoidSchema = z.object({
  reason: z
    .string({ message: 'Ingresá el motivo de la anulación' })
    .trim()
    .min(1, 'Ingresá el motivo de la anulación')
    .max(500),
})
export type PaymentVoidInput = z.input<typeof paymentVoidSchema>

/** A Customer's Payments (their paying history), or those noted against an Order; newest first. */
export const paymentListQuerySchema = paginationSchema.extend({
  customerId: z.uuid({ message: 'Elegí un cliente válido' }).optional(),
  orderId: z.uuid({ message: 'Elegí un pedido válido' }).optional(),
})
export type PaymentListQuery = z.input<typeof paymentListQuerySchema>
