import { expect, test } from './fixtures'

// es-AR writes a thousand as "1.000": every amount field reads it as 1000, not 1 with three decimals (#74).

interface CustomerWithBranches { id: string, branches: { id: string }[] }

test('an opening Balance of "12.500" and a Payment of "1.000" leave the Balance at $ 11.500,00', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', {
    name: 'Kiosco La Esquina',
    branches: [{ address: 'San Martín 100', city: 'Corral de Bustos' }]
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/clientes/${kiosco.id}`)
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('menuitem', { name: 'Saldo inicial' }).click()
  const opening = page.getByRole('dialog', { name: 'Saldo inicial' })
  await opening.getByLabel('Importe').fill('12.500')
  await opening.getByRole('button', { name: 'Guardar saldo inicial' }).click()
  await expect(opening).toBeHidden()
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('-$ 12.500,00')

  await page.getByRole('button', { name: 'Registrar pago' }).click()
  const sheet = page.getByRole('dialog', { name: 'Registrar pago' })
  await sheet.getByLabel('Importe').fill('1.000')
  await sheet.getByRole('button', { name: 'Registrar pago' }).click()

  await expect(sheet).toContainText('Pago en efectivo de $ 1.000,00')
  await expect(sheet.getByRole('status', { name: 'Saldo de Kiosco La Esquina' })).toHaveText('-$ 11.500,00')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('-$ 11.500,00')
})

test('a Price and a Purchase unit cost of "1.000" are a thousand', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const vaso = await callApi<{ id: string }>(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '850.00' })
  await callApi(userId, 'POST', '/suppliers', { name: 'Descartables del Sur' })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/productos/${vaso.id}`)
  await page.getByRole('button', { name: 'Cambiar precio' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cambiar precio' })
  await dialog.getByRole('textbox', { name: 'Precio nuevo' }).fill('1.000')
  await dialog.getByRole('button', { name: 'Guardar precio' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('region', { name: 'Historial de precios' }).getByRole('listitem').first()).toContainText('$ 1.000,00')

  await page.goto('/compras/nueva')
  await page.getByRole('button', { name: 'Proveedor' }).click()
  await page.getByRole('option', { name: 'Descartables del Sur' }).click()
  await page.getByRole('button', { name: 'Agregar producto' }).click()
  await page.getByRole('combobox', { name: 'Buscar producto' }).fill('vaso')
  await page.getByRole('option', { name: 'Vaso térmico 180 cc' }).click()
  const row = page.getByRole('group', { name: 'Vaso térmico 180 cc' })
  await row.getByRole('textbox', { name: 'Cantidad' }).fill('2')
  await row.getByRole('textbox', { name: 'Costo unitario' }).fill('1.000')
  await expect(page.getByRole('status', { name: 'Total' })).toHaveText('$ 2.000,00')
  await page.getByRole('button', { name: 'Registrar compra' }).click()
  await expect(page).toHaveURL(/\/compras\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('region', { name: 'Productos' }).getByRole('listitem').first()).toContainText('2 × $ 1.000,00')
})

test('an amount is grouped with dots and takes a comma for decimals as it is typed', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', {
    name: 'Kiosco La Esquina',
    branches: [{ address: 'San Martín 100', city: 'Corral de Bustos' }]
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/clientes/${kiosco.id}`)
  await page.getByRole('button', { name: 'Registrar pago' }).click()
  const amount = page.getByRole('dialog', { name: 'Registrar pago' }).getByLabel('Importe')
  await amount.pressSequentially('1234567')
  await expect(amount).toHaveValue('1.234.567')
  await amount.pressSequentially(',509')
  await expect(amount).toHaveValue('1.234.567,50')
  await amount.fill('')
  await amount.pressSequentially('2500.5')
  await expect(amount).toHaveValue('2.500,5')
})
