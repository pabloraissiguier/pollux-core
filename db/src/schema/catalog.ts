import { sql } from 'drizzle-orm'
import { boolean, check, foreignKey, index, integer, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { app, businessId, createdAt, id, money, percent, updatedAt } from './_shared'
import { businesses, profiles } from './tenancy'

/** Categoría: a single-level group of Products. */
export const categories = app.table('categories', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  name: text('name').notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  unique('categories_business_id_id_key').on(t.businessId, t.id),
  unique('categories_business_id_name_key').on(t.businessId, t.name),
]).enableRLS()

/**
 * Producto. One unit of sale per Product. `price` is final, VAT included (docs/adr/0003).
 * `stockOnHand` is a cached total of the Product's Stock movements, changed only in the same
 * transaction that inserts the movement. Reserved stock is not stored: it is derived from the
 * lines of Pending Orders.
 */
export const products = app.table('products', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  brand: text('brand'),
  categoryId: uuid('category_id'),
  price: money('price').notNull(),
  vatRate: percent('vat_rate').notNull().default('21.00'),
  imagePath: text('image_path'),
  isActive: boolean('is_active').notNull().default(true),
  stockOnHand: integer('stock_on_hand').notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  unique('products_business_id_id_key').on(t.businessId, t.id),
  unique('products_business_id_code_key').on(t.businessId, t.code),
  index('products_business_id_category_id_idx').on(t.businessId, t.categoryId),
  index('products_business_id_name_idx').on(t.businessId, t.name),
  foreignKey({
    name: 'products_category_fk',
    columns: [t.businessId, t.categoryId],
    foreignColumns: [categories.businessId, categories.id],
  }),
  check('products_price_check', sql`${t.price} >= 0`),
  check('products_vat_rate_check', sql`${t.vatRate} >= 0 and ${t.vatRate} <= 100`),
]).enableRLS()

/** Price history: one row per change. `oldPrice` is null for the price a Product was created with. */
export const productPriceChanges = app.table('product_price_changes', {
  id: id(),
  businessId: businessId(),
  productId: uuid('product_id').notNull(),
  oldPrice: money('old_price'),
  newPrice: money('new_price').notNull(),
  changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
  changedBy: uuid('changed_by').references(() => profiles.id),
}, t => [
  index('product_price_changes_product_idx').on(t.businessId, t.productId, t.changedAt),
  foreignKey({
    name: 'product_price_changes_product_fk',
    columns: [t.businessId, t.productId],
    foreignColumns: [products.businessId, products.id],
  }),
]).enableRLS()
