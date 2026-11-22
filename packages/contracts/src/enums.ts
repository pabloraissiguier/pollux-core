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

/** Order states: Pendiente, Entregado, Cancelado. Delivery is a state, not an entity (docs/adr/0002). */
export const ORDER_STATUSES = ['pending', 'delivered', 'cancelled'] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Type of a Movimiento de cuenta (Balance entry). Sales add debt, payments lower it; reversals are their own entries. */
export const BALANCE_ENTRY_TYPES = [
  'order_delivered',
  'delivery_undone',
  'payment',
  'payment_voided',
  'opening_balance',
  'adjustment',
] as const
export type BalanceEntryType = (typeof BALANCE_ENTRY_TYPES)[number]

/** Type of a Movimiento de stock (Stock movement). An 'adjustment' carries a Stock adjustment reason. */
export const STOCK_MOVEMENT_TYPES = ['order_delivered', 'delivery_undone', 'purchase', 'adjustment'] as const
export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number]
