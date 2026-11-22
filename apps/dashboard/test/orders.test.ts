import { describe, expect, it } from 'vitest'
import { availableAfter, discountForInput, orderFormTotals, tomorrowInArgentina } from '../app/utils/orders'
import type { OrderFormLine } from '../app/utils/orders'

describe('tomorrowInArgentina', () => {
  it('is the day after today in Argentina, even when it is already tomorrow in UTC', () => {
    // 22:30 in Buenos Aires on 21/11 is 01:30 UTC on 22/11.
    expect(tomorrowInArgentina(new Date('2026-11-22T01:30:00Z'))).toBe('2026-11-22')
  })

  it('rolls over the end of a month and of a year', () => {
    expect(tomorrowInArgentina(new Date('2026-11-30T15:00:00Z'))).toBe('2026-12-01')
    expect(tomorrowInArgentina(new Date('2026-12-31T15:00:00Z'))).toBe('2027-01-01')
  })
})

const line = (overrides: Partial<OrderFormLine>): OrderFormLine => ({
  productId: '00000000-0000-4000-8000-000000000000',
  product: { id: '00000000-0000-4000-8000-000000000000', code: 'X', name: 'X' },
  unitPrice: '1000.00',
  quantity: 1,
  reservedByOrder: 0,
  available: null,
  discountPercent: '',
  ...overrides
})

describe('orderFormTotals', () => {
  it('applies line Discounts, then the Order Discount, typed the es-AR way', () => {
    const totals = orderFormTotals({
      lines: [line({ quantity: 3, discountPercent: '10' }), line({ unitPrice: '500.00', quantity: 2 })],
      discountPercent: '5'
    })
    expect(totals).toEqual({ subtotal: '3700.00', discountAmount: '185.00', total: '3515.00' })
  })

  it('counts a Discount still being typed, or out of range, as none', () => {
    expect(orderFormTotals({ lines: [line({ discountPercent: '10,' })], discountPercent: '150' }).total).toBe('1000.00')
    expect(orderFormTotals({ lines: [line({ discountPercent: '12,5' })], discountPercent: '' }).total).toBe('875.00')
  })
})

describe('availableAfter', () => {
  it('takes only what the line adds beyond what the Order already reserved', () => {
    expect(availableAfter(line({ available: 1, quantity: 3 }))).toBe(-2)
    expect(availableAfter(line({ available: 0, quantity: 5, reservedByOrder: 4 }))).toBe(-1)
    expect(availableAfter(line({ available: null }))).toBeNull()
  })
})

describe('discountForInput', () => {
  it('shows a stored Discount without trailing zeros and with a comma, and none as blank', () => {
    expect(discountForInput('10.00')).toBe('10')
    expect(discountForInput('12.50')).toBe('12,5')
    expect(discountForInput('0.00')).toBe('')
  })
})
