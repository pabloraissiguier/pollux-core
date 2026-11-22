import { VAT_CONDITIONS } from '@pollux/contracts'
import { sql } from 'drizzle-orm'
import { numeric, pgSchema, timestamp, uuid } from 'drizzle-orm/pg-core'

/** All business tables live here. Only `public.profiles` lives outside it. See db/CLAUDE.md. */
export const app = pgSchema('app')

/** Condición frente al IVA, shared by Customers and the business itself. */
export const vatCondition = app.enum('vat_condition', VAT_CONDITIONS)

export const id = () => uuid('id').primaryKey().default(sql`gen_random_uuid()`)

export const businessId = () => uuid('business_id').notNull()

/** Money is always numeric(14,2), handled as a string in code. */
export const money = (name: string) => numeric(name, { precision: 14, scale: 2 })

/** Percentages such as discounts and VAT rates (e.g. 10.50). */
export const percent = (name: string) => numeric(name, { precision: 5, scale: 2 })

export const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

export const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
