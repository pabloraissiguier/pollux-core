import { foreignKey, index, text, unique, uuid } from 'drizzle-orm/pg-core'
import { app, businessId, createdAt, id, updatedAt, vatCondition } from './_shared'
import { businesses } from './tenancy'

/**
 * Cliente. One kind of customer only: how they pay is decided per Payment,
 * never stored here (see docs/adr/0001).
 */
export const customers = app.table('customers', {
  id: id(),
  businessId: businessId().references(() => businesses.id),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  cuit: text('cuit'),
  vatCondition: vatCondition('vat_condition'),
  phone: text('phone'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  unique('customers_business_id_id_key').on(t.businessId, t.id),
  index('customers_business_id_name_idx').on(t.businessId, t.name),
]).enableRLS()

/** Sucursal: one of a customer's delivery addresses. */
export const branches = app.table('branches', {
  id: id(),
  businessId: businessId(),
  customerId: uuid('customer_id').notNull(),
  name: text('name'),
  address: text('address').notNull(),
  city: text('city').notNull(),
  province: text('province').notNull().default('Córdoba'),
  postalCode: text('postal_code'),
  notes: text('notes'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, t => [
  unique('branches_business_id_id_key').on(t.businessId, t.id),
  // Lets an Order prove its Branch belongs to its Customer.
  unique('branches_business_id_customer_id_id_key').on(t.businessId, t.customerId, t.id),
  foreignKey({
    name: 'branches_customer_fk',
    columns: [t.businessId, t.customerId],
    foreignColumns: [customers.businessId, customers.id],
  }),
]).enableRLS()
