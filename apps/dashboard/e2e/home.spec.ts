import { dayInArgentina, expect, test } from './fixtures'

interface CustomerWithBranches { id: string, branches: { id: string }[] }

const branch = { address: 'San Martín 100', city: 'Corral de Bustos' }

test('Inicio shows today\'s deliveries and the total owed', { tag: '@desktop' }, async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const today = dayInArgentina()
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Kiosco La Esquina', branches: [branch] })
  const almacen = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Almacén Don Pepe', branches: [branch] })
  const order = (customer: CustomerWithBranches, quantity: number, deliveryDate: string) =>
    callApi(userId, 'POST', '/orders', {
      customerId: customer.id,
      branchId: customer.branches[0]!.id,
      deliveryDate,
      lines: [{ productId: vaso.id, quantity }]
    })
  await order(kiosco, 2, today)
  await order(almacen, 3, today)
  // Not today's to deliver: one for tomorrow, and one already delivered (on account).
  await order(kiosco, 4, dayInArgentina(1))
  const delivered = await order(almacen, 1, today)
  await callApi(userId, 'POST', `/orders/${delivered.id}/deliver`, {})
  await callApi(userId, 'POST', `/customers/${kiosco.id}/opening-balance`, { amount: '1500.00', entryDate: '2026-01-10' })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await expect(page.getByRole('status', { name: 'Pedidos para entregar hoy' })).toHaveText('2 pedidos')
  await expect(page.getByRole('status', { name: 'Total para entregar hoy' })).toHaveText('$ 5.000,00')
  // The delivered Order on account plus the Opening balance.
  await expect(page.getByRole('status', { name: 'Saldo total' })).toHaveText('$ 2.500,00')

  await page.getByRole('link', { name: 'Ver reparto' }).click()
  await expect(page).toHaveURL(/\/pedidos\/reparto/)
  await expect(page.getByRole('region', { name: 'Corral de Bustos' })).toContainText('Kiosco La Esquina')
})

test('from Inicio the owner records a Payment, picking the Customer, or starts an Order', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Kiosco La Esquina', branches: [branch] })
  await callApi(userId, 'POST', '/customers', { name: 'Almacén Don Pepe', branches: [branch] })
  await callApi(userId, 'POST', `/customers/${kiosco.id}/opening-balance`, { amount: '1500.00', entryDate: '2026-01-10' })
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('status', { name: 'Pedidos para entregar hoy' })).toHaveText('Ninguno')
  await expect(page.getByRole('status', { name: 'Saldo total' })).toHaveText('$ 1.500,00')

  await page.getByRole('button', { name: 'Registrar pago' }).click()
  const sheet = page.getByRole('dialog', { name: 'Registrar pago' })
  await sheet.getByLabel('Importe').fill('1000')
  await sheet.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(sheet).toContainText('Elegí un cliente')

  await sheet.getByRole('combobox', { name: 'Cliente' }).fill('Kiosco')
  await page.getByRole('option', { name: /Kiosco La Esquina/ }).click()
  await sheet.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(sheet.getByRole('status', { name: 'Saldo de Kiosco La Esquina' })).toHaveText('-$ 500,00')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('status', { name: 'Saldo total' })).toHaveText('$ 500,00')

  await page.getByRole('link', { name: 'Nuevo pedido' }).click()
  await expect(page).toHaveURL('/pedidos/nuevo')
})
