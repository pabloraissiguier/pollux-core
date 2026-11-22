import { z } from 'zod'
import { optionalCuitSchema } from './cuit'
import { pastDaySchema } from './day'
import { VAT_CONDITIONS } from './enums'

/** Optional free text: trimmed, and an empty string means "none" (stored as null). */
const optionalText = (max: number) => z
  .string()
  .trim()
  .max(max)
  .transform(v => (v === '' ? null : v))
  .nullish()

/**
 * Datos del negocio: the business's own data, printed on the Delivery note as the issuer.
 * Edit with a partial body: a field left out is kept; `null` or an empty string clears an
 * optional one. `name` can't be cleared.
 */
export const businessUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Ingresá el nombre').max(200),
  legalName: optionalText(200),
  cuit: optionalCuitSchema,
  vatCondition: z.enum(VAT_CONDITIONS).nullish(),
  address: optionalText(200),
  city: optionalText(120),
  province: optionalText(120),
  postalCode: optionalText(20),
  phone: optionalText(50),
  grossIncomeNumber: optionalText(50),
  /** Inicio de actividades: a past `yyyy-mm-dd` day. */
  activityStartDate: pastDaySchema('El inicio de actividades no puede ser una fecha futura').nullable(),
}).partial()
export type BusinessUpdateInput = z.input<typeof businessUpdateSchema>
