import { describe, expect, it } from 'vitest'
import { debitOrCredit, statementEntryLabel } from '../app/utils/balance'
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
