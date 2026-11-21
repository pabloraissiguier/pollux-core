import { z } from 'zod'

/**
 * Money and percentages travel as decimal strings with 2 decimals ("1234.50", "10.00"),
 * never as JS numbers. The arithmetic here works on integer hundredths (bigint), so there is
 * no float rounding. Results are rounded half-up (away from zero) to cents, like Postgres
 * `round()` on `numeric`.
 *
 * The dashboard uses these to show live totals in forms; the API stays the authority on
 * stored totals.
 */
export type Money = string
export type Percent = string

const DECIMAL = /^-?\d+(\.\d{1,2})?$/

function toHundredths(value: string): bigint {
  if (!DECIMAL.test(value)) throw new Error(`Not a decimal with up to 2 places: ${value}`)
  const negative = value.startsWith('-')
  const [whole = '0', fraction = ''] = (negative ? value.slice(1) : value).split('.')
  const hundredths = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  return negative ? -hundredths : hundredths
}

function fromHundredths(value: bigint): Money {
  const negative = value < 0n
  const abs = negative ? -value : value
  const fraction = (abs % 100n).toString().padStart(2, '0')
  return `${negative ? '-' : ''}${abs / 100n}.${fraction}`
}

/** Integer division rounded half away from zero. `divisor` must be positive. */
function divideRounded(dividend: bigint, divisor: bigint): bigint {
  const negative = dividend < 0n
  const abs = negative ? -dividend : dividend
  const rounded = (abs * 2n + divisor) / (divisor * 2n)
  return negative ? -rounded : rounded
}

export function addMoney(a: Money, b: Money): Money {
  return fromHundredths(toHundredths(a) + toHundredths(b))
}

export function subtractMoney(a: Money, b: Money): Money {
  return fromHundredths(toHundredths(a) - toHundredths(b))
}

export function sumMoney(amounts: readonly Money[]): Money {
  return fromHundredths(amounts.reduce((acc, a) => acc + toHundredths(a), 0n))
}

/** `amount × quantity`, exact. `quantity` must be an integer. */
export function multiplyMoney(amount: Money, quantity: number): Money {
  if (!Number.isInteger(quantity)) throw new Error(`Quantity must be an integer: ${quantity}`)
  return fromHundredths(toHundredths(amount) * BigInt(quantity))
}

/** `amount × percent / 100`, rounded half-up to cents. */
export function percentOf(amount: Money, percent: Percent): Money {
  return fromHundredths(divideRounded(toHundredths(amount) * toHundredths(percent), 10_000n))
}

/** `amount × (1 − percent / 100)`, rounded half-up to cents. */
export function applyDiscount(amount: Money, percent: Percent): Money {
  return fromHundredths(divideRounded(toHundredths(amount) * (10_000n - toHundredths(percent)), 10_000n))
}

/** `amount × (1 + percent / 100)`, rounded half-up to cents. A negative `percent` lowers it. */
export function changeByPercent(amount: Money, percent: Percent): Money {
  return fromHundredths(divideRounded(toHundredths(amount) * (10_000n + toHundredths(percent)), 10_000n))
}

/** A percentage field: a decimal string with up to 2 decimals, output with exactly 2 ("10" → "10.00"). */
export const percentSchema = z
  .string()
  .regex(DECIMAL, { message: 'Ingresá un porcentaje con hasta 2 decimales, por ejemplo 10.50' })
  .transform(value => fromHundredths(toHundredths(value)))

/** A money field: a decimal string with up to 2 decimals, output with exactly 2 ("7" → "7.00"). */
export const moneySchema = z
  .string()
  .regex(DECIMAL, { message: 'Ingresá un importe con hasta 2 decimales, por ejemplo 1234.50' })
  .transform(value => fromHundredths(toHundredths(value)))
