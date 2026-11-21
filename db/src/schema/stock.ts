import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, text, uuid } from 'drizzle-orm/pg-core'
import { app, businessId, createdAt, id } from './_shared'
import { products } from './catalog'
import { orders } from './orders'
import { purchases } from './purchases'
import { businesses, profiles } from './tenancy'

export const stockMovementType = app.enum('stock_movement_type', [
  'order_delivered',
  'delivery_undone',
  'purchase',
  'adjustment',
])

export const stockAdjustmentReason = app.enum('stock_adjustment_reason', [
  'initial_count',
  'count_correction',
  'breakage',
  'other',
])

/**
 * Movimiento de stock. `quantity` is signed: positive adds On-hand stock, negative removes it.
 * A Stock adjustment is a movement of type 'adjustment' with a reason.
 * Inserted in the same transaction that updates `products.stock_on_hand`; never edited or deleted.
 */
export const stockMovements = app.table('stock_movements', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  productId: uuid('product_id').notNull(),
  type: stockMovementType('type').notNull(),
  quantity: integer('quantity').notNull(),
  orderId: uuid('order_id'),
  purchaseId: uuid('purchase_id'),
  adjustmentReason: stockAdjustmentReason('adjustment_reason'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: createdAt(),
}, t => [
  index('stock_movements_product_idx').on(t.businessId, t.productId, t.createdAt),
  index('stock_movements_order_idx').on(t.businessId, t.orderId),
  index('stock_movements_purchase_idx').on(t.businessId, t.purchaseId),
  foreignKey({
    name: 'stock_movements_product_fk',
    columns: [t.businessId, t.productId],
    foreignColumns: [products.businessId, products.id],
  }),
  foreignKey({
    name: 'stock_movements_order_fk',
    columns: [t.businessId, t.orderId],
    foreignColumns: [orders.businessId, orders.id],
  }),
  foreignKey({
    name: 'stock_movements_purchase_fk',
    columns: [t.businessId, t.purchaseId],
    foreignColumns: [purchases.businessId, purchases.id],
  }),
  check('stock_movements_quantity_check', sql`${t.quantity} <> 0`),
  check('stock_movements_source_check', sql`
    case ${t.type}
      when 'order_delivered' then ${t.orderId} is not null and ${t.purchaseId} is null and ${t.adjustmentReason} is null and ${t.quantity} < 0
      when 'delivery_undone' then ${t.orderId} is not null and ${t.purchaseId} is null and ${t.adjustmentReason} is null and ${t.quantity} > 0
      when 'purchase' then ${t.purchaseId} is not null and ${t.orderId} is null and ${t.adjustmentReason} is null and ${t.quantity} > 0
      when 'adjustment' then ${t.adjustmentReason} is not null and ${t.orderId} is null and ${t.purchaseId} is null
    end`),
]).enableRLS()
