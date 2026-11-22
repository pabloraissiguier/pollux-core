import { describe, expect, it } from 'vitest'
import {
  balanceEntryTypeLabels,
  formatDate,
  formatMoney,
  formatPercent,
  formatUnits,
  formatUnitsChange,
  maskCuit,
  parseDecimalInput,
  orderStatusLabels,
  paymentMethodLabels,
  stockAdjustmentReasonLabels,
  stockMovementTypeLabels,
  vatConditionLabels
} from '../app/utils/format'

// Intl separates the currency sign with a non-breaking space.
const NBSP = ' '

describe('formatPercent', () => {
  it('shows a VAT rate with a decimal comma and no trailing zeros', () => {
    expect(formatPercent('21.00')).toBe(`21${NBSP}%`)
    expect(formatPercent('10.50')).toBe(`10,5${NBSP}%`)
    expect(formatPercent('2.50')).toBe(`2,5${NBSP}%`)
    expect(formatPercent('0.00')).toBe(`0${NBSP}%`)
  })
})

describe('formatUnits', () => {
  it('shows a stock quantity with dots for thousands', () => {
    expect(formatUnits(0)).toBe('0')
    expect(formatUnits(24)).toBe('24')
    expect(formatUnits(12345)).toBe('12.345')
    expect(formatUnits(-7)).toBe('-7')
  })
})

describe('formatUnitsChange', () => {
  it('shows a Stock movement with its sign', () => {
    expect(formatUnitsChange(24)).toBe('+24')
    expect(formatUnitsChange(-3)).toBe('-3')
    expect(formatUnitsChange(-1500)).toBe('-1.500')
  })
})

describe('formatMoney', () => {
  it('shows ARS with dots for thousands and a comma for cents', () => {
    expect(formatMoney('12345.50')).toBe(`$${NBSP}12.345,50`)
    expect(formatMoney('7')).toBe(`$${NBSP}7,00`)
    expect(formatMoney('0.00')).toBe(`$${NBSP}0,00`)
  })

  it('shows a credit balance with a minus sign', () => {
    expect(formatMoney('-1234.50')).toBe(`-$${NBSP}1.234,50`)
  })

  it('keeps every cent of a large decimal string', () => {
    expect(formatMoney('999999999999.99')).toBe(`$${NBSP}999.999.999.999,99`)
  })
})

describe('formatDate', () => {
  // vitest.config.ts runs these in Honolulu (UTC-10), where a midnight-UTC Date would show the day before.
  it('shows an ISO date as dd/mm/yyyy without drifting a day', () => {
    expect(formatDate('2026-11-21')).toBe('21/11/2026')
    expect(formatDate('2026-01-01')).toBe('01/01/2026')
  })

  it('shows a timestamp as its date in Argentina', () => {
    expect(formatDate('2026-11-21T02:30:00Z')).toBe('20/11/2026')
    expect(formatDate('2026-11-21T03:00:00.000Z')).toBe('21/11/2026')
  })

  it('refuses something that is not a date', () => {
    expect(() => formatDate('21/11/2026')).toThrow()
  })
})

describe('parseDecimalInput', () => {
  it('reads an amount typed the es-AR way, with or without thousands dots', () => {
    expect(parseDecimalInput('1234,50')).toBe('1234.50')
    expect(parseDecimalInput('1.234,50')).toBe('1234.50')
    expect(parseDecimalInput('1.234.567,5')).toBe('1234567.5')
  })

  it('takes a lone point as the decimal point, as the API writes amounts', () => {
    expect(parseDecimalInput('1234.50')).toBe('1234.50')
    expect(parseDecimalInput('1500')).toBe('1500')
  })

  it('ignores spaces and leaves anything else for validation to reject', () => {
    expect(parseDecimalInput(' 1 234,50 ')).toBe('1234.50')
    expect(parseDecimalInput('12a')).toBe('12a')
  })
})

describe('maskCuit', () => {
  it('adds the dashes while the CUIT is typed', () => {
    expect(maskCuit('2')).toBe('2')
    expect(maskCuit('20')).toBe('20')
    expect(maskCuit('201')).toBe('20-1')
    expect(maskCuit('2012345678')).toBe('20-12345678')
    expect(maskCuit('20123456786')).toBe('20-12345678-6')
  })

  it('ignores anything but digits and stops at 11 digits', () => {
    expect(maskCuit('20-12345678-6')).toBe('20-12345678-6')
    expect(maskCuit('20 1234.5678 69')).toBe('20-12345678-6')
  })
})

describe('enum labels', () => {
  it('names payment methods in Spanish', () => {
    expect(paymentMethodLabels).toEqual({ cash: 'Efectivo', bank_transfer: 'Transferencia', check: 'Cheque', other: 'Otro' })
  })

  it('names VAT conditions in Spanish', () => {
    expect(vatConditionLabels).toEqual({
      responsable_inscripto: 'Responsable Inscripto',
      monotributo: 'Monotributo',
      consumidor_final: 'Consumidor Final',
      exento: 'Exento'
    })
  })

  it('names stock adjustment reasons in Spanish', () => {
    expect(stockAdjustmentReasonLabels).toEqual({
      initial_count: 'Conteo inicial',
      count_correction: 'Corrección de conteo',
      breakage: 'Rotura',
      other: 'Otro'
    })
  })

  it('names order statuses in Spanish', () => {
    expect(orderStatusLabels).toEqual({ pending: 'Pendiente', delivered: 'Entregado', cancelled: 'Cancelado' })
  })

  it('names balance entry types in Spanish', () => {
    expect(balanceEntryTypeLabels).toEqual({
      order_delivered: 'Entrega de pedido',
      delivery_undone: 'Entrega deshecha',
      payment: 'Pago',
      payment_voided: 'Pago anulado',
      opening_balance: 'Saldo inicial',
      adjustment: 'Ajuste de saldo'
    })
  })

  it('names stock movement types in Spanish', () => {
    expect(stockMovementTypeLabels).toEqual({
      order_delivered: 'Entrega de pedido',
      delivery_undone: 'Entrega deshecha',
      purchase: 'Compra',
      adjustment: 'Ajuste de stock'
    })
  })
})
