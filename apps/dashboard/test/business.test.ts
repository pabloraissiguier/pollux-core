import { describe, expect, it } from 'vitest'
import { businessAddress, issuerLines } from '../app/utils/business'
import type { BusinessData } from '../app/utils/business'

const EMPTY: BusinessData = {
  name: 'Gio Pack',
  legalName: null,
  cuit: null,
  vatCondition: null,
  address: null,
  city: null,
  province: null,
  postalCode: null,
  phone: null,
  grossIncomeNumber: null,
  activityStartDate: null
}

describe('businessAddress', () => {
  it('joins the filled parts and skips the empty ones', () => {
    expect(businessAddress({ address: 'San Martín 450', city: 'Corral de Bustos', province: 'Córdoba', postalCode: '2645' }))
      .toBe('San Martín 450, Corral de Bustos, Córdoba (CP 2645)')
    expect(businessAddress({ address: null, city: 'Corral de Bustos', province: null, postalCode: '2645' }))
      .toBe('Corral de Bustos (CP 2645)')
    expect(businessAddress({ address: null, city: null, province: null, postalCode: '2645' })).toBe('(CP 2645)')
    expect(businessAddress({ address: null, city: null, province: null, postalCode: null })).toBe('')
  })
})

describe('issuerLines', () => {
  it('has no lines for a business with only its name', () => {
    expect(issuerLines(EMPTY)).toEqual([])
  })

  it('labels each filled field in Spanish, in print order, with the start date as dd/mm/yyyy', () => {
    expect(issuerLines({ ...EMPTY, cuit: '30712345671', vatCondition: 'monotributo', activityStartDate: '2015-03-01' })).toEqual([
      { label: 'CUIT', value: '30-71234567-1' },
      { label: 'Condición frente al IVA', value: 'Monotributo' },
      { label: 'Inicio de actividades', value: '01/03/2015' }
    ])
  })
})
