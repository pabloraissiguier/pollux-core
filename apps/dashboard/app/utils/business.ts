import { businessUpdateSchema } from '@pollux/contracts'
import type { VatCondition } from '@pollux/contracts'
import { z } from 'zod'
import { formatDate, maskCuit, vatConditionLabels } from './format'

/** Datos del negocio as the API sends them on a Delivery note: every field but `name` may be empty. */
export interface BusinessData {
  name: string
  legalName: string | null
  cuit: string | null
  vatCondition: VatCondition | null
  address: string | null
  city: string | null
  province: string | null
  postalCode: string | null
  phone: string | null
  grossIncomeNumber: string | null
  activityStartDate: string | null
}

/** One labelled line of the issuer block ("CUIT", "30-71234567-1"). */
export interface IssuerLine {
  label: string
  value: string
}

/** The business's address in one line ("San Martín 450, Corral de Bustos, Córdoba (CP 2645)"), or `''` when there is none. */
export function businessAddress(business: Pick<BusinessData, 'address' | 'city' | 'province' | 'postalCode'>): string {
  const place = [business.address, business.city, business.province].filter(Boolean).join(', ')
  const postalCode = business.postalCode ? `(CP ${business.postalCode})` : ''
  return [place, postalCode].filter(Boolean).join(' ')
}

/**
 * The issuer's details printed under its name on a Delivery note, each with its Spanish label,
 * leaving out every empty field so a business without these data still prints a clean sheet.
 */
export function issuerLines(business: BusinessData): IssuerLine[] {
  const lines: [string, string | null][] = [
    ['Domicilio', businessAddress(business)],
    ['Teléfono', business.phone],
    ['CUIT', business.cuit && maskCuit(business.cuit)],
    ['Condición frente al IVA', business.vatCondition && vatConditionLabels[business.vatCondition]],
    ['Ingresos Brutos', business.grossIncomeNumber],
    ['Inicio de actividades', business.activityStartDate && formatDate(business.activityStartDate)]
  ]
  return lines
    .filter((line): line is [string, string] => Boolean(line[1]))
    .map(([label, value]) => ({ label, value }))
}

/** The fields of the Datos del negocio form, as typed. `vatCondition: null` is "Sin especificar". */
export interface BusinessFormState {
  name: string
  legalName: string
  cuit: string
  vatCondition: VatCondition | null
  address: string
  city: string
  province: string
  postalCode: string
  phone: string
  grossIncomeNumber: string
  /** `yyyy-mm-dd` from the date input, or `''` when empty. */
  activityStartDate: string
}

export function businessFormState(business?: BusinessData | null): BusinessFormState {
  return {
    name: business?.name ?? '',
    legalName: business?.legalName ?? '',
    cuit: business?.cuit ?? '',
    vatCondition: business?.vatCondition ?? null,
    address: business?.address ?? '',
    city: business?.city ?? '',
    province: business?.province ?? '',
    postalCode: business?.postalCode ?? '',
    phone: business?.phone ?? '',
    grossIncomeNumber: business?.grossIncomeNumber ?? '',
    activityStartDate: business?.activityStartDate ?? ''
  }
}

/**
 * The Datos del negocio form: the API's `businessUpdateSchema` with the name required, and an
 * empty date input read as "none" (the shared schema takes `null`, not `''`, for a date). Every
 * field is sent, so one left blank is cleared.
 */
export const businessFormSchema = businessUpdateSchema.required({ name: true }).extend({
  activityStartDate: z.preprocess(v => (v === '' ? null : v), businessUpdateSchema.shape.activityStartDate)
})
export type BusinessFormOutput = z.output<typeof businessFormSchema>
