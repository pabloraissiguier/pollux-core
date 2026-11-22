import { sql } from 'drizzle-orm'
import { check, date, foreignKey, index, integer, text, unique, uuid } from 'drizzle-orm/pg-core'
import { app, businessId, createdAt, id, money, updatedAt } from './_shared'
import { products } from './catalog'
import { businesses, profiles } from './tenancy'

/** Proveedor. No supplier balance yet. */
export const suppliers = app.table('suppliers', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  name: text('name').notNull(),
  cuit: text('cuit'),
  phone: text('phone'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  unique('suppliers_business_id_id_key').on(t.businessId, t.id),
  index('suppliers_business_id_name_idx').on(t.businessId, t.name),
]).enableRLS()

/** Compra. A basic first version: registering it raises On-hand stock through Stock movements. */
export const purchases = app.table('purchases', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  supplierId: uuid('supplier_id').notNull(),
  purchasedOn: date('purchased_on').notNull(),
  invoiceNumber: text('invoice_number'),
  notes: text('notes'),
  createdBy: uuid('created_by').references(() => profiles.id),
  createdAt: createdAt(),
}, t => [
  unique('purchases_business_id_id_key').on(t.businessId, t.id),
  index('purchases_business_id_supplier_id_idx').on(t.businessId, t.supplierId, t.purchasedOn),
  foreignKey({
    name: 'purchases_supplier_fk',
    columns: [t.businessId, t.supplierId],
    foreignColumns: [suppliers.businessId, suppliers.id],
  }),
]).enableRLS()

export const purchaseLines = app.table('purchase_lines', {
  id: id(),
  businessId: businessId(),
  purchaseId: uuid('purchase_id').notNull(),
  productId: uuid('product_id').notNull(),
  quantity: integer('quantity').notNull(),
  unitCost: money('unit_cost').notNull(),
  /** Keeps the lines in the order they were entered (as on the Supplier's invoice). */
  position: integer('position').notNull().default(0),
  createdAt: createdAt(),
}, t => [
  index('purchase_lines_purchase_idx').on(t.businessId, t.purchaseId),
  index('purchase_lines_product_idx').on(t.businessId, t.productId),
  foreignKey({
    name: 'purchase_lines_purchase_fk',
    columns: [t.businessId, t.purchaseId],
    foreignColumns: [purchases.businessId, purchases.id],
  }).onDelete('cascade'),
  foreignKey({
    name: 'purchase_lines_product_fk',
    columns: [t.businessId, t.productId],
    foreignColumns: [products.businessId, products.id],
  }),
  check('purchase_lines_quantity_check', sql`${t.quantity} > 0`),
  check('purchase_lines_unit_cost_check', sql`${t.unitCost} >= 0`),
]).enableRLS()
