import { expect, test } from './fixtures'

// A new Order being taken survives leaving the page (or reloading it) until it's saved or discarded.

test('a new Order is kept while the owner leaves the page, and starts blank once saved', async ({ page, createOwner, signIn, createCustomer, callApi }) => {
  const userId = await createOwner('Gio Pack')
  await createCustomer(userId, { name: 'Kiosco La Esquina', branches: [{ address: 'Belgrano 50', city: 'Corral de Bustos' }] })
  await callApi(userId, 'POST', '/products', { code: 'BAN-103', name: 'Bandeja aluminio F100 x100 con tapa', price: '500' })
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await page.setViewportSize({ width: 375, height: 667 })
  await page.goto('/pedidos/nuevo')

  await page.getByRole('combobox', { name: 'Cliente' }).fill('kiosco')
  await page.getByRole('option', { name: /Kiosco La Esquina/ }).click()
  await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  const picker = page.getByRole('region', { name: 'Agregar productos' })
  await picker.getByRole('combobox', { name: 'Buscar producto' }).fill('bandeja')
  await picker.getByRole('option', { name: /Bandeja aluminio F100/ }).click()
  await picker.getByRole('option', { name: /Bandeja aluminio F100/ }).click()
  await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 1.000,00')

  // Away and back, even through a reload: the Customer, the lines and the step are still there.
  await page.goto('/clientes')
  await page.goto('/pedidos/nuevo')
  await expect(page.getByText('Recuperamos el pedido que estabas cargando', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Cliente del pedido' })).toContainText('Kiosco La Esquina')
  const lines = page.getByRole('region', { name: 'Productos del pedido' })
  await expect(lines.getByRole('spinbutton', { name: 'Cantidad de Bandeja aluminio F100 x100 con tapa' })).toHaveValue('2')
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 1.000,00')

  await page.getByRole('button', { name: 'Siguiente' }).click()
  await page.getByRole('button', { name: 'Confirmar pedido' }).click()
  await expect(page.getByRole('dialog', { name: 'Pedido N° 1 guardado' })).toBeVisible()

  // Saved: the next visit starts a blank Order.
  await page.goto('/pedidos/nuevo')
  await expect(page.getByRole('combobox', { name: 'Cliente' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 0,00')
  await expect(page.getByRole('button', { name: 'Empezar de nuevo' })).toHaveCount(0)
})

test('the owner discards a new Order after confirming and starts over', { tag: '@desktop' }, async ({ page, isMobile, createOwner, signIn, createCustomer, callApi }) => {
  const userId = await createOwner('Gio Pack')
  await createCustomer(userId, { name: 'Kiosco La Esquina', branches: [{ address: 'Belgrano 50', city: 'Corral de Bustos' }] })
  await callApi(userId, 'POST', '/products', { code: 'BAN-103', name: 'Bandeja aluminio F100 x100 con tapa', price: '500' })
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await page.goto('/pedidos/nuevo')

  await page.getByRole('combobox', { name: 'Cliente' }).fill('kiosco')
  await page.getByRole('option', { name: /Kiosco La Esquina/ }).click()
  if (isMobile) await page.getByRole('button', { name: 'Agregar', exact: true }).click()
  const picker = page.getByRole('region', { name: 'Agregar productos' })
  await picker.getByRole('combobox', { name: 'Buscar producto' }).fill('bandeja')
  await picker.getByRole('option', { name: /Bandeja aluminio F100/ }).click()
  if (isMobile) await page.getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 500,00')

  // Changing their mind is a deliberate step: "Volver" keeps the Order.
  await page.getByRole('button', { name: 'Empezar de nuevo' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Descartar este pedido?' })
  await confirm.getByRole('button', { name: 'Volver' }).click()
  await expect(confirm).toBeHidden()
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 500,00')

  await page.getByRole('button', { name: 'Empezar de nuevo' }).click()
  await confirm.getByRole('button', { name: 'Sí, descartar' }).click()
  await expect(page.getByRole('combobox', { name: 'Cliente' })).toBeVisible()
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 0,00')

  // Nothing comes back on the next visit.
  await page.reload()
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 0,00')
  await expect(page.getByText('Recuperamos el pedido que estabas cargando', { exact: true })).toHaveCount(0)
})
