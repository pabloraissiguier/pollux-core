import { describe, expect, it } from 'vitest'
import { lineSubtotal, orderTotals, orderUpdateSchema } from './orders'

describe('Order totals', () => {
  it('rounds each line to cents before adding, then takes the Order Discount from the subtotal', () => {
    const lines = [
      // 3 × 333.33 = 999.99, minus 15% = 849.9915 → 849.99
      { quantity: 3, unitPrice: '333.33', discountPercent: '15.00' },
      // 0.15 minus 50% = 0.075 → 0.08
      { quantity: 1, unitPrice: '0.15', discountPercent: '50.00' },
    ]
    expect(lines.map(lineSubtotal)).toEqual(['849.99', '0.08'])
    expect(orderTotals(lines, '10.00')).toEqual({ subtotal: '850.07', discountAmount: '85.01', total: '765.06' })
  })

  it('is zero for no lines and leaves the subtotal alone without an Order Discount', () => {
    expect(orderTotals([], '10.00')).toEqual({ subtotal: '0.00', discountAmount: '0.00', total: '0.00' })
    expect(orderTotals([{ quantity: 2, unitPrice: '1250.50', discountPercent: '0.00' }], '0.00'))
      .toEqual({ subtotal: '2501.00', discountAmount: '0.00', total: '2501.00' })
  })
})

describe('orderUpdateSchema', () => {
  it('refuses a new Customer', () => {
    const result = orderUpdateSchema.safeParse({ customerId: '6f1c1b8e-2f8a-4a57-9a51-2b0e7d1a3c4d' })
    expect(result.success).toBe(false)
  })
})
