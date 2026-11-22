import { afterEach, describe, expect, it, vi } from 'vitest'
import { orderDeliverSchema } from './orders'
import { paymentCreateSchema } from './payments'

afterEach(() => {
  vi.useRealTimers()
})

describe('the Delivered date cannot be in the future', () => {
  it('takes the calendar of Córdoba, not UTC: at 23:30 there, UTC is already on the next day', () => {
    // 2026-11-23T02:30Z is 2026-11-22 23:30 in Córdoba (UTC−3).
    vi.useFakeTimers({ now: new Date('2026-11-23T02:30:00Z') })

    expect(orderDeliverSchema.safeParse({ deliveredOn: '2026-11-22' }).success).toBe(true)
    expect(orderDeliverSchema.safeParse({ deliveredOn: '2026-11-21' }).success).toBe(true)
    const future = orderDeliverSchema.safeParse({ deliveredOn: '2026-11-23' })
    expect(future.success).toBe(false)
    expect(future.error?.issues).toMatchObject([{ path: ['deliveredOn'], message: 'La fecha entregada no puede ser futura' }])
  })

  it('reads today when validating, not when the schema was built', () => {
    vi.useFakeTimers({ now: new Date('2026-11-22T12:00:00Z') })
    expect(orderDeliverSchema.safeParse({ deliveredOn: '2026-11-23' }).success).toBe(false)

    vi.setSystemTime(new Date('2026-11-23T12:00:00Z'))
    expect(orderDeliverSchema.safeParse({ deliveredOn: '2026-11-23' }).success).toBe(true)
  })
})

describe('the Payment date cannot be in the future', () => {
  it('refuses tomorrow in Córdoba with a Spanish message on paidOn', () => {
    vi.useFakeTimers({ now: new Date('2026-11-23T02:30:00Z') })
    const base = { customerId: '6f1c1b8e-2f8a-4a57-9a51-2b0e7d1a3c4d', amount: '10', method: 'cash' }

    expect(paymentCreateSchema.safeParse({ ...base, paidOn: '2026-11-22' }).success).toBe(true)
    const future = paymentCreateSchema.safeParse({ ...base, paidOn: '2026-11-23' })
    expect(future.error?.issues).toMatchObject([{ path: ['paidOn'], message: 'La fecha de pago no puede ser futura' }])
  })
})
