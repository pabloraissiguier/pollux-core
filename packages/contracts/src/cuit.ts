import { z } from 'zod'

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

function digitsOf(input: string): string | null {
  const digits = input.trim().replace(/[-\s]/g, '')
  return /^\d{11}$/.test(digits) ? digits : null
}

/** The CUIT check digit for its first 10 digits (same rule as `db/seeds`: 11 → 0, 10 → 9). */
function checkDigit(base: string): number {
  const sum = [...base].reduce((acc, d, i) => acc + Number(d) * WEIGHTS[i]!, 0)
  const r = 11 - (sum % 11)
  return r === 11 ? 0 : r === 10 ? 9 : r
}

/** True when `input` is 11 digits (dashes and spaces allowed) with a correct check digit. */
export function isValidCuit(input: string): boolean {
  const digits = digitsOf(input)
  return digits !== null && checkDigit(digits.slice(0, 10)) === Number(digits[10])
}

/** Formats a valid CUIT as `XX-XXXXXXXX-X`, the way it is stored. */
export function formatCuit(input: string): string {
  const digits = digitsOf(input)
  if (!digits) throw new Error(`Not a CUIT: ${input}`)
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits[10]}`
}

/** A CUIT field: accepts it with or without dashes and outputs `XX-XXXXXXXX-X`. */
export const cuitSchema = z
  .string()
  .refine(isValidCuit, { message: 'El CUIT no es válido' })
  .transform(formatCuit)

/**
 * An optional CUIT field: checked for format and check digit, stored as `XX-XXXXXXXX-X`.
 * Empty means none (null).
 */
export const optionalCuitSchema = z
  .string()
  .trim()
  .transform(v => (v === '' ? null : v))
  .pipe(cuitSchema.nullable())
  .nullish()
