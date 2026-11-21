/**
 * Enum values shared by the DB schema, the API and the dashboard.
 * `@pollux/db` builds its Postgres enums from these, so they can't drift apart.
 */

/** Medio de pago. "On account" is not a method: it means no Payment was recorded (docs/adr/0001). */
export const PAYMENT_METHODS = ['cash', 'bank_transfer', 'check', 'other'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

/** Condición frente al IVA. */
export const VAT_CONDITIONS = ['responsable_inscripto', 'monotributo', 'consumidor_final', 'exento'] as const
export type VatCondition = (typeof VAT_CONDITIONS)[number]

/** Reason for a Stock adjustment. */
export const STOCK_ADJUSTMENT_REASONS = ['initial_count', 'count_correction', 'breakage', 'other'] as const
export type StockAdjustmentReason = (typeof STOCK_ADJUSTMENT_REASONS)[number]
