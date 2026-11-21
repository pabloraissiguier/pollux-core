import { describe, expect, it } from 'vitest'
import { addMoney, applyDiscount, changeByPercent, moneySchema, multiplyMoney, percentOf, subtractMoney, sumMoney } from './money'

describe('money', () => {
  it('adds and subtracts decimal strings without float drift', () => {
    expect(addMoney('0.10', '0.20')).toBe('0.30')
    expect(subtractMoney('100.00', '100.01')).toBe('-0.01')
    expect(sumMoney(['1.10', '2.20', '3.30'])).toBe('6.60')
    expect(sumMoney([])).toBe('0.00')
  })

  it('multiplies an amount by an integer quantity', () => {
    expect(multiplyMoney('1234.50', 3)).toBe('3703.50')
  })

  it('takes a percentage of an amount, rounding half-up to cents', () => {
    // 10% of 0.05 is 0.005, which rounds up to 0.01.
    expect(percentOf('0.05', '10.00')).toBe('0.01')
    // 10% of 0.04 is 0.004, which rounds down to 0.00.
    expect(percentOf('0.04', '10.00')).toBe('0.00')
    expect(percentOf('1500.00', '12.50')).toBe('187.50')
  })

  it('applies a discount percentage, rounding half-up to cents', () => {
    // 3 x 333.33 = 999.99, minus 15% = 849.9915 -> 849.99
    expect(applyDiscount(multiplyMoney('333.33', 3), '15.00')).toBe('849.99')
    // 0.15 minus 50% = 0.075 -> 0.08
    expect(applyDiscount('0.15', '50.00')).toBe('0.08')
    expect(applyDiscount('100.00', '0')).toBe('100.00')
  })

  it('raises or lowers an amount by a percentage, rounded half-up to cents', () => {
    // 333.33 × 1.125 = 374.99625 -> 375.00
    expect(changeByPercent('333.33', '12.50')).toBe('375.00')
    // 0.15 × 0.5 = 0.075 -> 0.08
    expect(changeByPercent('0.15', '-50.00')).toBe('0.08')
    expect(changeByPercent('1234.56', '-100.00')).toBe('0.00')
    expect(changeByPercent('10.00', '1000.00')).toBe('110.00')
  })

  it('rounds negative amounts away from zero', () => {
    expect(percentOf('-0.05', '10.00')).toBe('-0.01')
  })

  it('validates and normalizes money input to two decimals', () => {
    expect(moneySchema.parse('1234.5')).toBe('1234.50')
    expect(moneySchema.parse('7')).toBe('7.00')
    expect(moneySchema.safeParse('1.234').success).toBe(false)
    expect(moneySchema.safeParse('1,50').success).toBe(false)
    expect(moneySchema.safeParse(12.5).success).toBe(false)
  })
})
