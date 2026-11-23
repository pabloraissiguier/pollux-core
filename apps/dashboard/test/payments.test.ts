import { describe, expect, it } from 'vitest'
import { todayInArgentina } from '../app/utils/format'
import { paymentFormSchema } from '../app/utils/payments'

const form = (overrides: Record<string, string> = {}) => ({
  choice: 'cash',
  amount: '1.000,50',
  reference: '',
  day: '2026-01-10',
  ...overrides
})

/** A day well after today, so the test never depends on the clock. */
const FUTURE = `${Number(todayInArgentina().slice(0, 4)) + 1}-01-01`

describe('paymentFormSchema', () => {
  it('reads an es-AR amount into the Payment to record, with no reference when left blank', () => {
    expect(paymentFormSchema(false).parse(form())).toEqual({
      day: '2026-01-10',
      payment: { method: 'cash', amount: '1000.50', reference: null }
    })
  })

  it('reads "1.000" as a thousand, the way es-AR writes it without decimals', () => {
    expect(paymentFormSchema(false).parse(form({ amount: '1.000' })).payment?.amount).toBe('1000.00')
    expect(paymentFormSchema(false).parse(form({ amount: '12.500' })).payment?.amount).toBe('12500.00')
  })

  it('records no Payment for "Cuenta corriente (sin pago)", whatever the amount field holds', () => {
    expect(paymentFormSchema(true).parse(form({ choice: 'noPayment', amount: '' }))).toEqual({ day: '2026-01-10', payment: null })
  })

  it('refuses a zero or missing amount on a Payment', () => {
    const zero = paymentFormSchema(false).safeParse(form({ amount: '0' }))
    expect(zero.error?.issues.map(i => [i.path.join('.'), i.message])).toEqual([['amount', 'Ingresá un importe mayor a cero']])
    const empty = paymentFormSchema(false).safeParse(form({ amount: '' }))
    expect(empty.error?.issues.map(i => [i.path.join('.'), i.message])).toEqual([['amount', 'Ingresá el importe']])
  })

  it('refuses a future Payment date and a future Delivered date, each in its own words', () => {
    expect(paymentFormSchema(false).safeParse(form({ day: FUTURE })).error?.issues[0]?.message).toBe('La fecha de pago no puede ser futura')
    expect(paymentFormSchema(true).safeParse(form({ day: FUTURE })).error?.issues[0]?.message).toBe('La fecha entregada no puede ser futura')
  })
})
