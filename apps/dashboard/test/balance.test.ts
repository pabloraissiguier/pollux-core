import { describe, expect, it } from 'vitest'
import { balanceAdjustmentFormSchema, balanceAfter, balanceAmountText, balanceCaption, debitOrCredit, openingBalanceFormSchema, statementAmountText, statementEntryLabel } from '../app/utils/balance'
import type { StatementEntryLabelInput } from '../app/utils/balance'

const entry = (overrides: Partial<StatementEntryLabelInput>): StatementEntryLabelInput => ({
  type: 'adjustment',
  reason: null,
  order: null,
  payment: null,
  ...overrides
})

const ORDER = { id: '00000000-0000-4000-8000-000000000000', number: 123 }
const PAYMENT_ID = '00000000-0000-4000-8000-000000000001'

describe('statementEntryLabel', () => {
  it('names a delivery and its undo by the Order number', () => {
    expect(statementEntryLabel(entry({ type: 'order_delivered', order: ORDER }))).toBe('Entrega pedido N° 123')
    expect(statementEntryLabel(entry({ type: 'delivery_undone', order: ORDER }))).toBe('Entrega deshecha, pedido N° 123')
  })

  it('names a Payment by its method', () => {
    expect(statementEntryLabel(entry({ type: 'payment', payment: { id: PAYMENT_ID, method: 'cash' } }))).toBe('Pago en efectivo')
    expect(statementEntryLabel(entry({ type: 'payment', payment: { id: PAYMENT_ID, method: 'bank_transfer' } }))).toBe('Pago por transferencia')
    expect(statementEntryLabel(entry({ type: 'payment', payment: { id: PAYMENT_ID, method: 'check' } }))).toBe('Pago con cheque')
    expect(statementEntryLabel(entry({ type: 'payment', payment: { id: PAYMENT_ID, method: 'other' } }))).toBe('Pago (otro medio)')
  })

  it('names a voided Payment, an Opening balance and an adjustment with its reason', () => {
    expect(statementEntryLabel(entry({ type: 'payment_voided', payment: { id: PAYMENT_ID, method: 'cash' } }))).toBe('Pago anulado')
    expect(statementEntryLabel(entry({ type: 'opening_balance' }))).toBe('Saldo inicial')
    expect(statementEntryLabel(entry({ type: 'adjustment', reason: 'Incobrable' }))).toBe('Ajuste: Incobrable')
  })

  it('falls back to the plain entry type when a link is missing', () => {
    expect(statementEntryLabel(entry({ type: 'order_delivered' }))).toBe('Entrega de pedido')
    expect(statementEntryLabel(entry({ type: 'payment' }))).toBe('Pago')
    expect(statementEntryLabel(entry({ type: 'adjustment' }))).toBe('Ajuste de saldo')
  })
})

describe('debitOrCredit', () => {
  it('puts a positive amount in debe and a negative one in haber, without its sign', () => {
    expect(debitOrCredit('2469.00')).toEqual({ side: 'debit', amount: '2469.00' })
    expect(debitOrCredit('-500.50')).toEqual({ side: 'credit', amount: '500.50' })
  })
})

// Intl separates the currency sign with a non-breaking space.
const NBSP = String.fromCharCode(0xA0)

describe('statementAmountText', () => {
  it('says which column an amount goes in, without its sign', () => {
    expect(statementAmountText('2469.00')).toBe(`Debe $${NBSP}2.469,00`)
    expect(statementAmountText('-100.00')).toBe(`Haber $${NBSP}100,00`)
  })
})

describe('balanceCaption', () => {
  it('says what a Balance means in words', () => {
    expect(balanceCaption('2969.00')).toBe('Debe')
    expect(balanceCaption('-50.00')).toBe('A favor del cliente')
    expect(balanceCaption('0.00')).toBe('Al día')
  })
})

describe('balanceAmountText', () => {
  it('says a Balance in a list with its side', () => {
    expect(balanceAmountText('1500.00')).toBe(`Debe $${NBSP}1.500,00`)
    expect(balanceAmountText('-300.00')).toBe(`A favor $${NBSP}300,00`)
    expect(balanceAmountText('0.00')).toBe('Al día')
  })
})

describe('balanceAfter', () => {
  it('previews the Balance an entry leaves, from an amount typed the es-AR way', () => {
    expect(balanceAfter('1500.00', 'credit', '200')).toBe('1300.00')
    expect(balanceAfter('100.00', 'credit', '1.250,50')).toBe('-1150.50')
    expect(balanceAfter('0.00', 'debit', '2.500,50')).toBe('2500.50')
    expect(balanceAfter('1500.00', 'credit', '1.000')).toBe('500.00')
  })

  it('has nothing to show until the amount is valid', () => {
    expect(balanceAfter('1500.00', 'debit', '')).toBeNull()
    expect(balanceAfter('1500.00', 'debit', '0')).toBeNull()
  })
})

describe('manual entry forms', () => {
  it('turn the typed amount into a decimal string, keeping the side apart', () => {
    expect(balanceAdjustmentFormSchema.parse({ side: 'credit', amount: '1.250,50', reason: ' Incobrable ', entryDate: '2026-01-10' }))
      .toEqual({ side: 'credit', amount: '1250.50', reason: 'Incobrable', entryDate: '2026-01-10' })
    expect(openingBalanceFormSchema.parse({ side: 'debit', amount: '1.000', entryDate: '2026-01-10' }))
      .toEqual({ side: 'debit', amount: '1000.00', entryDate: '2026-01-10' })
  })

  it('refuse a future day, each with its own message', () => {
    const future = '2999-01-01'
    const adjustment = balanceAdjustmentFormSchema.safeParse({ side: 'debit', amount: '10', reason: 'x', entryDate: future })
    const opening = openingBalanceFormSchema.safeParse({ side: 'debit', amount: '10', entryDate: future })
    expect(adjustment.error?.issues.map(i => i.message)).toEqual(['La fecha del ajuste no puede ser futura'])
    expect(opening.error?.issues.map(i => i.message)).toEqual(['La fecha del saldo inicial no puede ser futura'])
  })

  it('require the adjustment\'s reason', () => {
    const result = balanceAdjustmentFormSchema.safeParse({ side: 'debit', amount: '10', reason: '  ', entryDate: '2026-01-10' })
    expect(result.error?.issues.map(i => i.message)).toEqual(['Ingresá el motivo del ajuste'])
  })
})
