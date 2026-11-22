import { authUsers } from 'drizzle-orm/supabase'
import { date, index, integer, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { app, businessId, createdAt, id, updatedAt, vatCondition } from './_shared'

/**
 * The app's user profile, 1:1 with `auth.users`.
 * The only table that references `auth.users`; everything else references `profiles`.
 */
export const profiles = pgTable('profiles', {
  id: uuid('id').primaryKey().references(() => authUsers.id, { onDelete: 'cascade' }),
  fullName: text('full_name'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS()

/**
 * The tenant. Every business table carries a `business_id` pointing here.
 * Besides `name`, its own data is what the Delivery note prints as the issuer: legal name, CUIT,
 * VAT condition, address, phone, Ingresos Brutos number and start of activities. All optional,
 * so a business can start without them.
 */
export const businesses = app.table('businesses', {
  id: id(),
  name: text('name').notNull(),
  legalName: text('legal_name'),
  cuit: text('cuit'),
  vatCondition: vatCondition('vat_condition'),
  address: text('address'),
  city: text('city'),
  province: text('province'),
  postalCode: text('postal_code'),
  phone: text('phone'),
  /** Número de Ingresos Brutos, as printed (format varies by province). */
  grossIncomeNumber: text('gross_income_number'),
  /** Inicio de actividades, a calendar day. */
  activityStartDate: date('activity_start_date'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS()

export const memberRole = app.enum('member_role', ['owner'])

export const businessMembers = app.table('business_members', {
  businessId: businessId().references(() => businesses.id, { onDelete: 'cascade' }),
  profileId: uuid('profile_id').notNull().references(() => profiles.id, { onDelete: 'cascade' }),
  role: memberRole('role').notNull().default('owner'),
  createdAt: createdAt(),
}, t => [
  primaryKey({ columns: [t.businessId, t.profileId] }),
  index('business_members_profile_id_idx').on(t.profileId),
]).enableRLS()

export const sequenceKind = app.enum('sequence_kind', ['order', 'delivery_note'])

/**
 * Per-business counters for human-facing numbers (Order number, Delivery note number).
 * Taken with `UPDATE ... SET last_value = last_value + 1 RETURNING` inside the same transaction,
 * so numbers are gapless and never reused.
 */
export const businessSequences = app.table('business_sequences', {
  businessId: businessId().references(() => businesses.id, { onDelete: 'cascade' }),
  kind: sequenceKind('kind').notNull(),
  lastValue: integer('last_value').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.businessId, t.kind] }),
]).enableRLS()
