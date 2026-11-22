import { z } from 'zod'

/** A calendar day, `yyyy-mm-dd`. */
export const daySchema = z.iso.date({ message: 'Ingresá una fecha válida (aaaa-mm-dd)' })

const cordobaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Cordoba',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today as `yyyy-mm-dd` in America/Argentina/Cordoba, the business's calendar. */
export function todayInCordoba(now = new Date()): string {
  return cordobaDay.format(now)
}

/**
 * A calendar day that is today or earlier in America/Argentina/Cordoba, for dates that record
 * something that already happened (the Delivered date, the Payment date). `message` is the
 * Spanish error for a future day. Today is read at validation time, not when the schema is built.
 */
export function pastDaySchema(message: string) {
  return daySchema.refine(day => day <= todayInCordoba(), { message })
}
