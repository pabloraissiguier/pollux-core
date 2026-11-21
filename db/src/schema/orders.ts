import { sql } from 'drizzle-orm'
import { check, date, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { app, businessId, createdAt, id, money, percent, updatedAt } from './_shared'
import { branches, customers } from './customers'
import { products } from './catalog'
import { businesses, profiles } from './tenancy'

export const orderStatus = app.enum('order_status', ['pending', 'delivered', 'cancelled'])

/**
 * Pedido. Delivery is a state, not a separate entity (docs/adr/0002).
 * The Delivery note (Remito) is printed from the Order: its number is taken the first time it is
 * printed and never reused, even if the Order is later cancelled.
 */
export const orders = app.table('orders', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  number: integer('number').notNull(),
  customerId: uuid('customer_id').notNull(),
  branchId: uuid('branch_id').notNull(),
  status: orderStatus('status').notNull().default('pending'),
  deliveryDate: date('delivery_date').notNull(),
  deliveredOn: date('delivered_on'),
  discountPercent: percent('discount_percent').notNull().default('0'),
  notes: text('notes'),
  deliveryNoteNumber: integer('delivery_note_number'),
  deliveryNoteIssuedAt: timestamp('delivery_note_issued_at', { withTimezone: true }),
  cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  unique('orders_business_id_id_key').on(t.businessId, t.id),
  // Lets a Payment prove the Order it notes belongs to the same Customer.
  unique('orders_business_id_customer_id_id_key').on(t.businessId, t.customerId, t.id),
  unique('orders_business_id_number_key').on(t.businessId, t.number),
  unique('orders_business_id_delivery_note_number_key').on(t.businessId, t.deliveryNoteNumber),
  index('orders_business_id_status_delivery_date_idx').on(t.businessId, t.status, t.deliveryDate),
  foreignKey({
    name: 'orders_customer_fk',
    columns: [t.businessId, t.customerId],
    foreignColumns: [customers.businessId, customers.id],
  }),
  // The Branch must belong to the Order's Customer.
  foreignKey({
    name: 'orders_branch_fk',
    columns: [t.businessId, t.customerId, t.branchId],
    foreignColumns: [branches.businessId, branches.customerId, branches.id],
  }),
  check('orders_delivered_on_check', sql`(${t.status} = 'delivered') = (${t.deliveredOn} is not null)`),
  check('orders_cancelled_at_check', sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)`),
  check('orders_delivery_note_check', sql`(${t.deliveryNoteNumber} is null) = (${t.deliveryNoteIssuedAt} is null)`),
  check('orders_discount_percent_check', sql`${t.discountPercent} >= 0 and ${t.discountPercent} <= 100`),
]).enableRLS()

/** Línea de pedido. `unitPrice` is frozen when the line is added (final price, VAT included). */
export const orderLines = app.table('order_lines', {
  id: id(),
  businessId: businessId(),
  orderId: uuid('order_id').notNull(),
  productId: uuid('product_id').notNull(),
  position: integer('position').notNull().default(0),
  quantity: integer('quantity').notNull(),
  unitPrice: money('unit_price').notNull(),
  discountPercent: percent('discount_percent').notNull().default('0'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  index('order_lines_order_idx').on(t.businessId, t.orderId),
  index('order_lines_product_idx').on(t.businessId, t.productId),
  foreignKey({
    name: 'order_lines_order_fk',
    columns: [t.businessId, t.orderId],
    foreignColumns: [orders.businessId, orders.id],
  }).onDelete('cascade'),
  foreignKey({
    name: 'order_lines_product_fk',
    columns: [t.businessId, t.productId],
    foreignColumns: [products.businessId, products.id],
  }),
  check('order_lines_quantity_check', sql`${t.quantity} > 0`),
  check('order_lines_unit_price_check', sql`${t.unitPrice} >= 0`),
  check('order_lines_discount_percent_check', sql`${t.discountPercent} >= 0 and ${t.discountPercent} <= 100`),
]).enableRLS()
