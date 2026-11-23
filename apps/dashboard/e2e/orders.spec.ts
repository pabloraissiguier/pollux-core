import { expect, test, type Locator, type Page } from './fixtures'

/** Tomorrow in Argentina as `yyyy-mm-dd`, the Delivery date a new Order starts with. */
function tomorrowInArgentina(): string {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const [y, m, d] = today.split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + 1)).toISOString().slice(0, 10)
}

/** An Order's request bodies seen by the browser, to count the writes. */
function watchOrderWrites(page: Page) {
  const writes: string[] = []
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname
    if (path.startsWith('/orders') && request.method() !== 'GET' && request.method() !== 'OPTIONS') {
      writes.push(`${request.method()} ${path.replace(/[0-9a-f-]{36}/, ':id')}`)
    }
  })
  return writes
}

test('the owner takes an Order with Discounts on a phone, sees the live total and a stock warning, and gets its number', { tag: '@desktop' }, async ({ page, isMobile, createOwner, signIn, createCustomer, callApi }) => {
  const userId = await createOwner('Gio Pack')
  await createCustomer(userId, { name: 'Kiosco La Esquina', branches: [{ address: 'Belgrano 50', city: 'Corral de Bustos' }] })
  const category = await callApi(userId, 'POST', '/categories', { name: 'Descartables' })
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  await callApi(userId, 'POST', '/stock/adjustments', { productId: vaso.id, quantity: 10, reason: 'initial_count' })
  await callApi(userId, 'POST', '/products', { code: 'BAN-103', name: 'Bandeja 103', price: '500', categoryId: category.id })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto('/pedidos')
  await page.getByRole('link', { name: 'Nuevo pedido' }).click()
  await expect(page).toHaveURL('/pedidos/nuevo')
  // The list has a Cliente field too: wait until the new page has replaced it.
  await expect(page.getByRole('heading', { name: 'Nuevo pedido', level: 1 })).toBeVisible()

  // Customer by search; with one Branch, it's picked on its own.
  await page.getByRole('combobox', { name: 'Cliente' }).fill('kiosco')
  await page.getByRole('option', { name: /Kiosco La Esquina/ }).click()
  await expect(page.getByText('Belgrano 50, Corral de Bustos')).toBeVisible()
  await expect(page.getByLabel('Fecha de entrega')).toHaveValue(tomorrowInArgentina())

  // A Product found by search, with its Price and Available stock.
  const picker = page.getByRole('region', { name: 'Agregar productos' })
  await picker.getByRole('combobox', { name: 'Buscar producto' }).fill('vaso')
  // A tap on the result adds it.
  const vasoRow = picker.getByRole('option', { name: /Vaso térmico 180 cc/ })
  await expect(vasoRow).toContainText('$ 1.000,00')
  await expect(vasoRow).toContainText('Disponible 10')
  await vasoRow.click()

  // Another one by browsing its Category.
  await picker.getByRole('combobox', { name: 'Buscar producto' }).fill('')
  await picker.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: 'Descartables' }).click()
  await picker.getByRole('option', { name: /Bandeja 103/ }).click()

  const lines = page.getByRole('region', { name: 'Productos del pedido' })
  await lines.getByRole('button', { name: 'Sumar uno a Vaso térmico 180 cc' }).click()
  await lines.getByRole('button', { name: 'Sumar uno a Vaso térmico 180 cc' }).click()
  await lines.getByRole('button', { name: 'Sumar uno a Bandeja 103' }).click()
  await lines.getByRole('textbox', { name: 'Descuento de Vaso térmico 180 cc' }).fill('10')

  // Bandeja has no stock: a warning, never a block.
  const bandejaLine = lines.getByRole('listitem').filter({ hasText: 'Bandeja 103' })
  await expect(bandejaLine).toContainText('Sin stock suficiente: el disponible quedaría en -2')
  await expect(lines.getByRole('listitem').filter({ hasText: 'Vaso térmico 180 cc' })).not.toContainText('Sin stock suficiente')

  await page.getByRole('textbox', { name: 'Descuento del pedido' }).fill('5')
  await page.getByRole('textbox', { name: 'Notas' }).fill('Dejar en el depósito')

  // 3 × 1.000 − 10 % = 2.700; 2 × 500 = 1.000; 3.700 − 5 % = 3.515.
  const total = page.getByRole('status', { name: 'Total del pedido' })
  await expect(total).toHaveText('$ 3.515,00')

  if (!isMobile) {
    // At the PC the lines and the Product picker sit side by side.
    const linesBox = (await lines.boundingBox())!
    const pickerBox = (await picker.boundingBox())!
    expect(pickerBox.x).toBeGreaterThanOrEqual(linesBox.x + linesBox.width)
    expect(pickerBox.y).toBeLessThan(linesBox.y + linesBox.height)
  }

  // A double tap saves once.
  const writes = watchOrderWrites(page)
  await page.getByRole('button', { name: 'Guardar pedido' }).dblclick()
  const saved = page.getByRole('dialog', { name: 'Pedido N° 1 guardado' })
  await expect(saved).toBeVisible()
  await expect(saved).toContainText('$ 3.515,00')
  await expect(saved).toContainText('Bandeja 103: el disponible quedó en -2')
  expect(writes).toEqual(['POST /orders'])

  await saved.getByRole('link', { name: 'Ver pedido' }).click()
  await expect(page).toHaveURL(/\/pedidos\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Pedido N° 1', level: 1 })).toBeVisible()
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible()
  const detailLines = page.getByRole('region', { name: 'Productos' }).getByRole('listitem')
  await expect(detailLines).toHaveCount(2)
  await expect(detailLines.first()).toContainText('3 × $ 1.000,00')
  await expect(detailLines.first()).toContainText('Descuento 10 %')
  await expect(detailLines.first()).toContainText('$ 2.700,00')
  const totals = page.getByRole('region', { name: 'Totales' })
  await expect(totals).toContainText('Subtotal$ 3.700,00')
  await expect(totals).toContainText('Descuento del pedido (5 %)-$ 185,00')
  await expect(totals).toContainText('Total$ 3.515,00')
  await expect(page.getByText('Dejar en el depósito')).toBeVisible()
})

/** Presses Tab until `target` has focus, as someone at the keyboard would. */
async function tabTo(page: Page, target: Locator) {
  for (let presses = 0; presses < 30; presses++) {
    if (await target.evaluate(element => element === document.activeElement)) return
    await page.keyboard.press('Tab')
  }
  await expect(target).toBeFocused()
}

test('the owner takes a phone Order at the PC with the keyboard alone after picking the Customer', { tag: '@desktop' }, async ({ page, createOwner, signIn, createCustomer, callApi }) => {
  const userId = await createOwner('Gio Pack')
  await createCustomer(userId, { name: 'Kiosco La Esquina', branches: [{ address: 'Belgrano 50', city: 'Corral de Bustos' }] })
  await callApi(userId, 'POST', '/products', { code: 'BAN-103', name: 'Bandeja 103', price: '500' })
  await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  await callApi(userId, 'POST', '/products', { code: 'VAS-240', name: 'Vaso térmico 240 cc', price: '1200' })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto('/pedidos/nuevo')
  await page.getByRole('combobox', { name: 'Cliente' }).fill('kiosco')
  await page.getByRole('option', { name: /Kiosco La Esquina/ }).click()
  await expect(page.getByText('Belgrano 50, Corral de Bustos')).toBeVisible()

  const picker = page.getByRole('region', { name: 'Agregar productos' })
  const search = picker.getByRole('combobox', { name: 'Buscar producto' })
  const lines = page.getByRole('region', { name: 'Productos del pedido' })
  const writes = watchOrderWrites(page)
  await tabTo(page, search)

  // Enter right after typing adds the first result of that search, not of an older one.
  await page.keyboard.type('bandeja')
  await page.keyboard.press('Enter')
  await expect(lines.getByRole('spinbutton', { name: 'Cantidad de Bandeja 103' })).toHaveValue('1')
  await expect(search).toBeFocused()
  // The text stays, selected: Enter again adds one more, typing starts the next search.
  await page.keyboard.press('Enter')
  await expect(lines.getByRole('spinbutton', { name: 'Cantidad de Bandeja 103' })).toHaveValue('2')

  await page.keyboard.type('vaso')
  const results = picker.getByRole('listbox', { name: 'Resultados' })
  await expect(results.getByRole('option')).toHaveCount(2)
  await expect(results.getByRole('option', { selected: true })).toContainText('Vaso térmico 180 cc')
  await page.keyboard.press('ArrowDown')
  await expect(results.getByRole('option', { selected: true })).toContainText('Vaso térmico 240 cc')
  await page.keyboard.press('ArrowDown')
  await expect(results.getByRole('option', { selected: true })).toContainText('Vaso térmico 240 cc')
  await page.keyboard.press('ArrowUp')
  await expect(results.getByRole('option', { selected: true })).toContainText('Vaso térmico 180 cc')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(lines.getByRole('spinbutton', { name: 'Cantidad de Vaso térmico 240 cc' })).toHaveValue('1')
  await expect(lines.getByRole('listitem').filter({ hasText: 'Vaso térmico 180 cc' })).toHaveCount(0)
  await expect(search).toBeFocused()

  // 2 × 500 + 1 × 1.200; none of those Enters saved the Order.
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 2.200,00')
  expect(writes).toEqual([])
  await tabTo(page, page.getByRole('button', { name: 'Guardar pedido' }))
  await page.keyboard.press('Enter')
  const saved = page.getByRole('dialog', { name: 'Pedido N° 1 guardado' })
  await expect(saved).toBeVisible()
  await expect(saved).toContainText('$ 2.200,00')
  expect(writes).toEqual(['POST /orders'])
})

test('the owner edits a Pending Order: kept lines keep their price, new lines take the current one', async ({ page, createOwner, signIn, createCustomer, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const customerId = await createCustomer(userId, { name: 'Kiosco La Esquina', branches: [{ address: 'Belgrano 50', city: 'Corral de Bustos' }] })
  const customer = await callApi<{ branches: { id: string }[] }>(userId, 'GET', `/customers/${customerId}`)
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  await callApi(userId, 'POST', '/stock/adjustments', { productId: vaso.id, quantity: 2, reason: 'initial_count' })
  const bandeja = await callApi(userId, 'POST', '/products', { code: 'BAN-103', name: 'Bandeja 103', price: '500' })
  await callApi(userId, 'POST', '/stock/adjustments', { productId: bandeja.id, quantity: 50, reason: 'initial_count' })
  const order = await callApi(userId, 'POST', '/orders', {
    customerId,
    branchId: customer.branches[0]!.id,
    deliveryDate: '2026-12-01',
    lines: [{ productId: vaso.id, quantity: 2 }]
  })
  // Prices go up after the Order was taken.
  await callApi(userId, 'PATCH', `/products/${vaso.id}`, { price: '1200' })
  await callApi(userId, 'PATCH', `/products/${bandeja.id}`, { price: '600' })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/pedidos/${order.id}`)
  await page.getByRole('link', { name: 'Editar' }).click()
  await expect(page).toHaveURL(`/pedidos/${order.id}/editar`)
  await expect(page.getByText('Kiosco La Esquina')).toBeVisible()

  const lines = page.getByRole('region', { name: 'Productos del pedido' })
  const vasoLine = lines.getByRole('listitem').filter({ hasText: 'Vaso térmico 180 cc' })
  await expect(vasoLine).toContainText('$ 1.000,00 c/u (precio del pedido)')
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 2.000,00')
  // The Order already holds the 2 units on hand, so there's no shortage yet.
  await expect(vasoLine).not.toContainText('Sin stock suficiente')

  // One more than what's on hand warns at once, on a kept line too.
  await lines.getByRole('button', { name: 'Sumar uno a Vaso térmico 180 cc' }).click()
  await expect(vasoLine).toContainText('Sin stock suficiente: el disponible quedaría en -1')

  const picker = page.getByRole('region', { name: 'Agregar productos' })
  await picker.getByRole('combobox', { name: 'Buscar producto' }).fill('bandeja')
  await picker.getByRole('option', { name: /Bandeja 103/ }).click()
  await expect(lines.getByRole('listitem').filter({ hasText: 'Bandeja 103' })).toContainText('$ 600,00 c/u (precio actual)')
  await page.getByRole('textbox', { name: 'Descuento del pedido' }).fill('10')
  // 3 × 1.000 (kept price) + 1 × 600 (today's Price) = 3.600, less 10 %.
  await expect(page.getByRole('status', { name: 'Total del pedido' })).toHaveText('$ 3.240,00')

  const writes = watchOrderWrites(page)
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page).toHaveURL(`/pedidos/${order.id}`)
  expect(writes).toEqual(['PATCH /orders/:id'])
  const detailLines = page.getByRole('region', { name: 'Productos' }).getByRole('listitem')
  await expect(detailLines).toHaveCount(2)
  await expect(detailLines.first()).toContainText('3 × $ 1.000,00')
  await expect(detailLines.last()).toContainText('1 × $ 600,00')
  await expect(page.getByRole('region', { name: 'Totales' })).toContainText('Descuento del pedido (10 %)-$ 360,00')
  await expect(page.getByRole('region', { name: 'Totales' })).toContainText('Total$ 3.240,00')
})

test('the owner finds Orders by town and Customer, and cancels one after confirming', async ({ page, createOwner, signIn, createCustomer, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kioscoId = await createCustomer(userId, { name: 'Kiosco La Esquina', branches: [{ address: 'Belgrano 50', city: 'Corral de Bustos' }] })
  const superId = await createCustomer(userId, { name: 'Supermercado Isla', branches: [{ address: 'Mitre 900', city: 'Isla Verde' }] })
  const kiosco = await callApi<{ branches: { id: string }[] }>(userId, 'GET', `/customers/${kioscoId}`)
  const superIsla = await callApi<{ branches: { id: string }[] }>(userId, 'GET', `/customers/${superId}`)
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  const line = [{ productId: vaso.id, quantity: 1 }]
  await callApi(userId, 'POST', '/orders', { customerId: kioscoId, branchId: kiosco.branches[0]!.id, deliveryDate: '2026-12-01', lines: line })
  await callApi(userId, 'POST', '/orders', { customerId: superId, branchId: superIsla.branches[0]!.id, deliveryDate: '2026-12-02', lines: line })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto('/pedidos')
  const kioscoOrder = page.getByRole('link', { name: /Kiosco La Esquina/ })
  const superOrder = page.getByRole('link', { name: /Supermercado Isla/ })
  await expect(kioscoOrder).toContainText('N° 1')
  await expect(kioscoOrder).toContainText('01/12/2026')
  await expect(superOrder).toContainText('N° 2')

  await page.getByRole('button', { name: 'Localidad' }).click()
  await page.getByRole('option', { name: 'Isla Verde' }).click()
  await expect(superOrder).toBeVisible()
  await expect(kioscoOrder).toHaveCount(0)
  await expect(page).toHaveURL('/pedidos?localidad=Isla+Verde')

  await page.goto('/pedidos')
  await page.getByLabel('Fecha de entrega').fill('2026-12-01')
  await expect(superOrder).toHaveCount(0)
  await expect(kioscoOrder).toBeVisible()

  await page.goto('/pedidos')

  await page.getByRole('combobox', { name: 'Cliente' }).fill('super')
  await page.getByRole('option', { name: /Supermercado Isla/ }).click()
  await expect(kioscoOrder).toHaveCount(0)
  await superOrder.click()

  await expect(page.getByRole('heading', { name: 'Pedido N° 2', level: 1 })).toBeVisible()
  const writes = watchOrderWrites(page)
  await page.getByRole('button', { name: 'Cancelar pedido' }).click()
  const confirm = page.getByRole('dialog', { name: '¿Cancelar el pedido N° 2?' })
  await confirm.getByRole('button', { name: 'Volver' }).click()
  await expect(confirm).toBeHidden()
  expect(writes).toEqual([])

  await page.getByRole('button', { name: 'Cancelar pedido' }).click()
  await confirm.getByRole('button', { name: 'Sí, cancelar pedido' }).click()
  await expect(page.getByText('Cancelado', { exact: true })).toBeVisible()
  expect(writes).toEqual(['POST /orders/:id/cancel'])
  await expect(page.getByRole('link', { name: 'Editar' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Cancelar pedido' })).toHaveCount(0)

  // The status filter finds it among the Cancelled ones only.
  await page.goto('/pedidos')
  await page.getByRole('button', { name: 'Estado' }).click()
  await page.getByRole('option', { name: 'Cancelado' }).click()
  await expect(superOrder).toBeVisible()
  await expect(superOrder).toContainText('Cancelado')
  await expect(kioscoOrder).toHaveCount(0)
})
