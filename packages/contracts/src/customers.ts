import { z } from 'zod'
import { optionalCuitSchema } from './cuit'
import { VAT_CONDITIONS } from './enums'
import { paginationSchema } from './pagination'

/** Optional free text: trimmed, and an empty string means "none" (stored as null). */
const optionalText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .transform(v => (v === '' ? null : v))
  .nullish()

const requiredText = (max: number, message: string) => z.string().trim().min(1, message).max(max)

/** Sucursal: one of a Customer's delivery addresses. `city` is the town routes are planned by. */
export const branchSchema = z.object({
  name: optionalText(120),
  address: requiredText(200, 'Ingresá la dirección'),
  city: requiredText(120, 'Ingresá la localidad'),
  /** Defaults to Córdoba when left out. */
  province: z.string().trim().min(1).max(120).optional(),
  postalCode: optionalText(20),
  notes: optionalText(1000),
})
export type BranchInput = z.input<typeof branchSchema>

/** Edit a Branch: send only the fields that change. */
export const branchUpdateSchema = branchSchema.partial()
export type BranchUpdateInput = z.input<typeof branchUpdateSchema>

const customerFields = z.object({
  name: requiredText(200, 'Ingresá el nombre'),
  legalName: optionalText(200),
  cuit: optionalCuitSchema,
  vatCondition: z.enum(VAT_CONDITIONS).nullish(),
  phone: optionalText(50),
  notes: optionalText(1000),
})

/**
 * Cliente. There is one kind of Customer: nothing about how they pay lives here.
 * A new Customer comes with at least one Branch.
 */
export const customerCreateSchema = customerFields.extend({
  branches: z.array(branchSchema).min(1, 'Agregá al menos una sucursal'),
})
export type CustomerCreateInput = z.input<typeof customerCreateSchema>

/** Edit a Customer's details: send only the fields that change; `null` clears an optional one. */
export const customerUpdateSchema = customerFields.partial()
export type CustomerUpdateInput = z.input<typeof customerUpdateSchema>

/** Search by name, legal name or CUIT (`q`) and filter by town (a Branch's city). */
export const customerListQuerySchema = paginationSchema.extend({
  q: z.string().trim().optional(),
  town: z.string().trim().optional(),
})
export type CustomerListQuery = z.input<typeof customerListQuerySchema>
