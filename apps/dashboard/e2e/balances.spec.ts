import { apiPath, dayInArgentina, expect, test } from './fixtures'

interface CustomerWithBranches { id: string, branches: { id: string }[] }

const branch = { address: 'San Martín 100', city: 'Corral de Bustos' }

test('the owner sees who owes, largest first, with the grand total', { tag: '@desktop' }, async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Kiosco La Esquina', branches: [branch] })
  const almacen = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Almacén Don José', branches: [branch] })
  const bar = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Bar El Paso', branches: [branch] })
  // Al día: left out of the list.
  await callApi(userId, 'POST', '/customers', { name: 'Despensa Sin Deuda', branches: [branch] })
  await callApi(userId, 'POST', `/customers/${kiosco.id}/opening-balance`, { amount: '1500.00', entryDate: '2026-01-10' })
  await callApi(userId, 'POST', `/customers/${almacen.id}/opening-balance`, { amount: '12000.50', entryDate: '2026-01-10' })
  await callApi(userId, 'POST', `/customers/${bar.id}/opening-balance`, { amount: '-300.00', entryDate: '2026-01-10' })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto('/cuentas-corrientes')
  // 12.000,50 + 1.500,00 − 300,00: what the business is owed, net of credits.
  await expect(page.getByRole('status', { name: 'Saldo total' })).toHaveText('$ 13.200,50')

  const rows = page.getByRole('list', { name: 'Clientes con saldo' }).getByRole('listitem')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0)).toContainText('Almacén Don José')
  await expect(rows.nth(0)).toContainText('Debe $ 12.000,50')
  await expect(rows.nth(1)).toContainText('Kiosco La Esquina')
  await expect(rows.nth(1)).toContainText('Debe $ 1.500,00')
  await expect(rows.nth(2)).toContainText('Bar El Paso')
  await expect(rows.nth(2)).toContainText('A favor $ 300,00')

  // Collecting from a row: the sheet already knows the Customer, and the list follows.
  await rows.nth(1).getByRole('button', { name: 'Registrar pago de Kiosco La Esquina' }).click()
  const sheet = page.getByRole('dialog', { name: 'Registrar pago' })
  await expect(sheet).toContainText('Kiosco La Esquina')
  await sheet.getByLabel('Importe').fill('1500')
  await sheet.getByRole('button', { name: 'Registrar pago' }).click()
  await expect(sheet.getByRole('status', { name: 'Saldo de Kiosco La Esquina' })).toHaveText('$ 0,00')
  await sheet.getByRole('button', { name: 'Listo' }).click()
  await expect(rows).toHaveCount(2)
  await expect(page.getByRole('status', { name: 'Saldo total' })).toHaveText('$ 11.700,50')

  // A row opens that Customer's statement.
  await rows.nth(0).getByRole('link', { name: 'Almacén Don José' }).click()
  await expect(page).toHaveURL(`/cuentas-corrientes/${almacen.id}`)
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 12.000,50')
})

test('the owner enters a Customer\'s Opening balance once, from the Customer page', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Kiosco La Esquina', branches: [branch] })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  // Whether it's offered comes from the Balance, not from reading the Statement.
  const statementReads: string[] = []
  page.on('request', (request) => {
    if (apiPath(request.url()) === `/customers/${kiosco.id}/statement`) statementReads.push(request.url())
  })

  await page.goto(`/clientes/${kiosco.id}`)
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 0,00')
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('menuitem', { name: 'Saldo inicial' }).click()
  const modal = page.getByRole('dialog', { name: 'Saldo inicial' })
  await expect(modal.getByRole('radio', { name: 'Debe' })).toBeChecked()
  await modal.getByLabel('Importe').fill('2.500,50')

  await expect(modal.getByLabel('Fecha')).toHaveAttribute('max', dayInArgentina())
  await modal.getByLabel('Fecha').fill(dayInArgentina(1))
  await modal.getByRole('button', { name: 'Guardar saldo inicial' }).click()
  await expect(modal).toContainText('La fecha del saldo inicial no puede ser futura')
  await modal.getByLabel('Fecha').fill('2026-01-10')
  await modal.getByRole('button', { name: 'Guardar saldo inicial' }).click()
  await expect(modal).toBeHidden()
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 2.500,50')

  // Once it's there, it's no longer offered: corrections are Balance adjustments.
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await expect(page.getByRole('menuitem', { name: 'Ajustar saldo' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Saldo inicial' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.reload()
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await expect(page.getByRole('menuitem', { name: 'Ajustar saldo' })).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Saldo inicial' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  expect(statementReads).toEqual([])

  await page.getByRole('link', { name: 'Ver resumen de cuenta' }).click()
  const entries = page.getByRole('list', { name: 'Movimientos de cuenta' }).getByRole('listitem')
  await expect(entries).toHaveCount(1)
  await expect(entries.first()).toContainText('Saldo inicial')
  await expect(entries.first()).toContainText('10/01/2026')
  await expect(entries.first()).toContainText('Debe $ 2.500,50')
})

test('the owner prints a statement for a date range', { tag: '@desktop' }, async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Kiosco La Esquina', branches: [branch] })
  await callApi(userId, 'POST', `/customers/${kiosco.id}/opening-balance`, { amount: '1500.00', entryDate: '2026-01-10' })
  await callApi(userId, 'POST', `/customers/${kiosco.id}/balance-adjustments`, { amount: '-200.00', reason: 'Error de carga', entryDate: '2026-02-15' })
  await callApi(userId, 'POST', '/payments', { customerId: kiosco.id, method: 'cash', amount: '300.00', paidOn: '2026-03-01' })
  // The print dialog can't be driven in a test: count the calls instead.
  await page.addInitScript(() => {
    const w = window as unknown as { printed: number }
    w.printed = 0
    window.print = () => {
      w.printed++
    }
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/cuentas-corrientes/${kiosco.id}?desde=2026-02-01`)
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('menuitem', { name: 'Imprimir resumen' }).click()
  await expect(page).toHaveURL(`/cuentas-corrientes/${kiosco.id}/imprimir?desde=2026-02-01`)

  // A chrome-free sheet: no sidebar, the business, the Customer and the period.
  await expect(page.getByRole('heading', { name: 'Resumen de cuenta' })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
  await expect(page.getByText('Gio Pack')).toBeVisible()
  await expect(page.getByText('Kiosco La Esquina')).toBeVisible()
  await expect(page.getByText('Desde el 01/02/2026')).toBeVisible()

  // The Balance carried into the range, then each entry with its running Balance.
  const rows = page.getByRole('table', { name: 'Movimientos de cuenta' }).getByRole('row')
  await expect(rows).toHaveCount(4)
  await expect(rows.nth(1)).toContainText('Saldo anterior')
  await expect(rows.nth(1)).toContainText('$ 1.500,00')
  await expect(rows.nth(2)).toContainText('15/02/2026')
  await expect(rows.nth(2)).toContainText('Ajuste: Error de carga')
  await expect(rows.nth(2)).toContainText('$ 1.300,00')
  await expect(rows.nth(3)).toContainText('Pago en efectivo')
  await expect(rows.nth(3)).toContainText('$ 300,00')
  await expect(page.getByRole('status', { name: 'Saldo final' })).toHaveText('$ 1.000,00')

  // It opens the print dialog by itself, and again on demand.
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1)
  await page.getByRole('button', { name: 'Imprimir' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(2)

  await page.getByRole('link', { name: 'Volver al resumen' }).click()
  await expect(page).toHaveURL(`/cuentas-corrientes/${kiosco.id}?desde=2026-02-01`)

  // A range with no entries still ends in the Balance that held through it.
  await page.goto(`/cuentas-corrientes/${kiosco.id}/imprimir?desde=2026-02-16&hasta=2026-02-28`)
  await expect(page.getByText('No hay movimientos en estas fechas.')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Saldo final' })).toHaveText('$ 1.300,00')
})

test('the owner adjusts a Balance with a reason and sees it on the statement', { tag: '@desktop' }, async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', { name: 'Kiosco La Esquina', branches: [branch] })
  await callApi(userId, 'POST', `/customers/${kiosco.id}/opening-balance`, { amount: '1500.00', entryDate: '2026-01-10' })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/cuentas-corrientes/${kiosco.id}`)
  await page.getByRole('button', { name: 'Más acciones' }).click()
  await page.getByRole('menuitem', { name: 'Ajustar saldo' }).click()
  const modal = page.getByRole('dialog', { name: 'Ajustar saldo' })
  await expect(modal.getByLabel('Fecha')).toHaveValue(dayInArgentina())

  // The amount and the reason are required.
  await modal.getByRole('button', { name: 'Guardar ajuste' }).click()
  await expect(modal).toContainText('Ingresá el importe')
  await expect(modal).toContainText('Ingresá el motivo del ajuste')

  // A write-off lowers the Balance; the resulting Balance shows while typing.
  await modal.getByRole('radio', { name: 'Restar del saldo' }).check()
  await modal.getByLabel('Importe').fill('200')
  await expect(modal).toContainText('Saldo: $ 1.500,00 → $ 1.300,00')
  await modal.getByLabel('Motivo').fill('Descuento por pronto pago')

  // It already happened: the date picker stops at today, and a future day is refused in the form,
  // before reaching the API.
  await expect(modal.getByLabel('Fecha')).toHaveAttribute('max', dayInArgentina())
  await modal.getByLabel('Fecha').fill(dayInArgentina(1))
  await modal.getByRole('button', { name: 'Guardar ajuste' }).click()
  await expect(modal).toContainText('La fecha del ajuste no puede ser futura')
  await modal.getByLabel('Fecha').fill(dayInArgentina())
  await modal.getByRole('button', { name: 'Guardar ajuste' }).click()
  await expect(modal).toBeHidden()

  const entries = page.getByRole('list', { name: 'Movimientos de cuenta' }).getByRole('listitem')
  await expect(entries).toHaveCount(2)
  await expect(entries.nth(1)).toContainText('Ajuste: Descuento por pronto pago')
  await expect(entries.nth(1)).toContainText('Haber $ 200,00')
  await expect(entries.nth(1)).toContainText('Saldo $ 1.300,00')
  await expect(page.getByRole('status', { name: 'Saldo' })).toHaveText('$ 1.300,00')
})
