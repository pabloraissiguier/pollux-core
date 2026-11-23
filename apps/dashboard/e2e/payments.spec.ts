import { dayInArgentina, expect, test } from './fixtures'

interface CustomerWithBranches { id: string, branches: { id: string }[] }

test('the owner delivers an Order with a partial cash Payment and sees the remaining Balance', { tag: '@desktop' }, async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1234.50' })
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', {
    name: 'Kiosco La Esquina',
    branches: [{ address: 'San Martín 100', city: 'Corral de Bustos' }]
  })
  const order = await callApi<{ id: string, number: number }>(userId, 'POST', '/orders', {
    customerId: kiosco.id,
    branchId: kiosco.branches[0]!.id,
    deliveryDate: dayInArgentina(),
    lines: [{ productId: vaso.id, quantity: 2 }]
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/pedidos/${order.id}`)
  await page.getByRole('button', { name: 'Entregar' }).click()
  const sheet = page.getByRole('dialog', { name: `Entregar pedido N° ${order.number}` })
  await expect(sheet.getByRole('radio', { name: 'Cuenta corriente (sin pago)' })).toBeChecked()
  // On account there is no amount to type.
  await expect(sheet.getByLabel('Importe')).toHaveCount(0)

  // Cash: the amount starts at the total, and a partial Payment is a quick edit.
  await sheet.getByRole('radio', { name: 'Efectivo' }).check()
  await expect(sheet.getByLabel('Importe')).toHaveValue('2469,00')
  await sheet.getByLabel('Importe').fill('1.000,50')

  // The Delivered date cannot be in the future.
  await sheet.getByLabel('Fecha entregada').fill(dayInArgentina(1))
  await sheet.getByRole('button', { name: 'Confirmar entrega' }).click()
  await expect(sheet).toContainText('La fecha entregada no puede ser futura')
  await sheet.getByLabel('Fecha entregada').fill(dayInArgentina())
  await sheet.getByRole('button', { name: 'Confirmar entrega' }).click()

  await expect(sheet).toContainText('Pedido entregado')
  await expect(sheet).toContainText('Pago en efectivo de $ 1.000,50')
  await expect(sheet.getByRole('status', { name: 'Saldo de Kiosco La Esquina' })).toHaveText('$ 1.468,50')
  await sheet.getByRole('button', { name: 'Listo' }).click()

  // The Order lists its Payments.
  const payments = page.getByRole('region', { name: 'Pagos' })
  await expect(payments.getByRole('listitem')).toHaveCount(1)
  await expect(payments.getByRole('listitem').first()).toContainText('Efectivo')
  await expect(payments.getByRole('listitem').first()).toContainText('$ 1.000,50')

  // The Customer's page shows what is still owed.
  await page.getByRole('link', { name: 'Kiosco La Esquina' }).click()
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 1.468,50')
})

test('the owner records a standalone Payment from the Customer page and voids it', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', {
    name: 'Kiosco La Esquina',
    branches: [{ address: 'San Martín 100', city: 'Corral de Bustos' }]
  })
  await callApi(userId, 'POST', `/customers/${kiosco.id}/opening-balance`, { amount: '2000.00', entryDate: '2026-01-10' })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/clientes/${kiosco.id}`)
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 2.000,00')
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  const sheet = page.getByRole('dialog', { name: 'Registrar pago' })
  await expect(sheet).toContainText('Kiosco La Esquina')
  await expect(sheet.getByLabel('Fecha de pago')).toHaveValue(dayInArgentina())
  await sheet.getByRole('radio', { name: 'Transferencia' }).check()
  await sheet.getByLabel('Importe').fill('750')
  await sheet.getByLabel('Referencia').fill('TRF 0042')

  // The Payment date cannot be in the future.
  await sheet.getByLabel('Fecha de pago').fill(dayInArgentina(1))
  await sheet.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(sheet).toContainText('La fecha de pago no puede ser futura')
  await sheet.getByLabel('Fecha de pago').fill(dayInArgentina())
  await sheet.getByRole('button', { name: 'Registrar pago' }).click()

  await expect(sheet).toContainText('Pago registrado')
  await expect(sheet.getByRole('status', { name: 'Saldo de Kiosco La Esquina' })).toHaveText('$ 1.250,00')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(sheet).toBeHidden()

  // The page shows the new Balance and the Payment.
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 1.250,00')
  const recent = page.getByRole('region', { name: 'Pagos recientes' })
  const payment = recent.getByRole('listitem').first()
  await expect(payment).toContainText('Transferencia')
  await expect(payment).toContainText('TRF 0042')
  await expect(payment).toContainText('$ 750,00')

  // Voiding asks for a reason and a confirmation.
  await payment.getByRole('button', { name: 'Anular pago' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Anular el pago de $ 750,00?' })
  await confirm.getByRole('button', { name: 'Sí, anular pago' }).click()
  await expect(confirm).toContainText('Ingresá el motivo de la anulación')
  await confirm.getByLabel('Motivo').fill('Transferencia rechazada')
  await confirm.getByRole('button', { name: 'Sí, anular pago' }).click()
  await expect(confirm).toBeHidden()

  // The voided Payment stays visible, marked, and the Balance is back.
  await expect(payment).toContainText('Anulado')
  await expect(payment).toContainText('Transferencia rechazada')
  await expect(payment.getByRole('button', { name: 'Anular pago' })).toHaveCount(0)
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 2.000,00')

  // The statement shows the Payment and its reversal.
  await page.getByRole('link', { name: 'Ver resumen de cuenta' }).click()
  const entries = page.getByRole('list', { name: 'Movimientos de cuenta' }).getByRole('listitem')
  await expect(entries).toHaveCount(3)
  await expect(entries.nth(1)).toContainText('Pago por transferencia')
  await expect(entries.nth(1)).toContainText('Haber $ 750,00')
  await expect(entries.nth(2)).toContainText('Pago anulado')
  await expect(entries.nth(2)).toContainText('Debe $ 750,00')
  await expect(entries.nth(2)).toContainText('Saldo $ 2.000,00')

  // Registrar pago is also at hand from the statement, and the statement follows it.
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  const again = page.getByRole('dialog', { name: 'Registrar pago' })
  await again.getByRole('radio', { name: 'Efectivo' }).check()
  await again.getByLabel('Importe').fill('2000')
  await again.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(again.getByRole('status', { name: 'Saldo de Kiosco La Esquina' })).toHaveText('$ 0,00')
  await again.getByRole('button', { name: 'Listo' }).click()
  await expect(entries).toHaveCount(4)
  await expect(entries.nth(3)).toContainText('Pago en efectivo')
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 0,00')
})
