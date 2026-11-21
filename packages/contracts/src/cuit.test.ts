import { describe, expect, it } from 'vitest'
import { cuitSchema, isValidCuit } from './cuit'

describe('CUIT', () => {
  it('accepts a real CUIT with or without dashes', () => {
    // AFIP's own CUIT, 33-69345023-9.
    expect(isValidCuit('33-69345023-9')).toBe(true)
    expect(isValidCuit('33693450239')).toBe(true)
    expect(isValidCuit('20-12345678-6')).toBe(true)
  })

  it('rejects a wrong check digit, a wrong length or letters', () => {
    expect(isValidCuit('33-69345023-8')).toBe(false)
    expect(isValidCuit('20-1234567-6')).toBe(false)
    expect(isValidCuit('20-1234567A-6')).toBe(false)
    expect(isValidCuit('')).toBe(false)
  })

  it('normalizes a valid CUIT to XX-XXXXXXXX-X', () => {
    expect(cuitSchema.parse(' 33693450239 ')).toBe('33-69345023-9')
  })

  it('reports an invalid CUIT in Spanish', () => {
    const result = cuitSchema.safeParse('20-12345678-0')
    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.message).toBe('El CUIT no es válido')
  })
})
