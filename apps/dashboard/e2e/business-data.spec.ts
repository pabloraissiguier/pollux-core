import { expect, test } from './fixtures'

interface CustomerWithBranches { id: string, branches: { id: string }[] }

test('the owner fills in the business data and the printed Delivery note shows them', { tag: '@desktop' }, async ({ page, createOwner, signIn, openSidebar, callApi }) => {
  const userId = await createOwner('Gio Pack')
  const vaso = await callApi(userId, 'POST', '/products', { code: 'VAS-180', name: 'Vaso térmico 180 cc', price: '1000' })
  const kiosco = await callApi<CustomerWithBranches>(userId, 'POST', '/customers', {
    name: 'Kiosco La Esquina',
    branches: [{ address: 'Belgrano 20', city: 'Cruz Alta' }]
  })
  const order = await callApi(userId, 'POST', '/orders', {
    customerId: kiosco.id, branchId: kiosco.branches[0]!.id, deliveryDate: '2026-03-10', lines: [{ productId: vaso.id, quantity: 1 }]
  })
  await page.addInitScript(() => {
    window.print = () => {}
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await openSidebar()
  await page.getByRole('link', { name: 'Datos del negocio' }).click()
  await expect(page).toHaveURL('/datos-del-negocio')
  await expect(page.getByRole('textbox', { name: 'Nombre' })).toHaveValue('Gio Pack')

  await page.getByRole('textbox', { name: 'Razón social' }).fill('Gio Pack S.R.L.')
  await page.getByRole('textbox', { name: 'CUIT' }).fill('30712345671')
  await expect(page.getByRole('textbox', { name: 'CUIT' })).toHaveValue('30-71234567-1')
  await page.getByRole('button', { name: 'Condición frente al IVA' }).click()
  await page.getByRole('option', { name: 'Responsable Inscripto' }).click()
  await page.getByRole('textbox', { name: 'Dirección' }).fill('San Martín 450')
  await page.getByRole('textbox', { name: 'Localidad' }).fill('Corral de Bustos')
  await page.getByRole('textbox', { name: 'Provincia' }).fill('Córdoba')
  await page.getByRole('textbox', { name: 'Código postal' }).fill('2645')
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('03468 15-123456')
  await page.getByRole('textbox', { name: 'Ingresos Brutos' }).fill('280-123456-7')
  await page.getByLabel('Inicio de actividades').fill('2015-03-01')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Datos del negocio guardados', { exact: true })).toBeVisible()

  // What was saved comes back on a fresh load.
  await page.reload()
  await expect(page.getByRole('textbox', { name: 'Razón social' })).toHaveValue('Gio Pack S.R.L.')
  await expect(page.getByRole('button', { name: 'Condición frente al IVA' })).toHaveText('Responsable Inscripto')
  await expect(page.getByLabel('Inicio de actividades')).toHaveValue('2015-03-01')

  await page.goto(`/pedidos/${order.id}/remito`)
  const issuer = page.getByRole('region', { name: 'Emisor' })
  await expect(issuer.getByText('Gio Pack S.R.L.', { exact: true })).toBeVisible()
  await expect(issuer.getByText('Domicilio San Martín 450, Corral de Bustos, Córdoba (CP 2645)')).toBeVisible()
  await expect(issuer.getByText('Teléfono 03468 15-123456')).toBeVisible()
  await expect(issuer.getByText('CUIT 30-71234567-1')).toBeVisible()
  await expect(issuer.getByText('Condición frente al IVA Responsable Inscripto')).toBeVisible()
  await expect(issuer.getByText('Ingresos Brutos 280-123456-7')).toBeVisible()
  await expect(issuer.getByText('Inicio de actividades 01/03/2015')).toBeVisible()
})

test('clearing optional fields saves them empty, and errors show next to their fields', async ({ page, createOwner, signIn, callApi }) => {
  const userId = await createOwner('Gio Pack')
  await callApi(userId, 'PATCH', '/business', {
    legalName: 'razón social a completar',
    cuit: '30712345671',
    vatCondition: 'responsable_inscripto',
    phone: '03468 15-123456',
    activityStartDate: '2015-03-01'
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await page.goto('/datos-del-negocio')
  await expect(page.getByRole('textbox', { name: 'Razón social' })).toHaveValue('razón social a completar')

  // Errors show by their fields, and nothing is saved.
  await page.getByRole('textbox', { name: 'Nombre' }).fill('')
  await page.getByRole('textbox', { name: 'CUIT' }).fill('30712345670')
  await page.getByLabel('Inicio de actividades').fill('2999-01-01')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Ingresá el nombre')).toBeVisible()
  await expect(page.getByText('El inicio de actividades no puede ser una fecha futura')).toBeVisible()
  await expect(page.getByText('El CUIT no es válido')).toBeVisible()
  expect((await callApi<{ name: string }>(userId, 'GET', '/business')).name).toBe('Gio Pack')

  // Clearing optional fields saves them empty.
  await page.getByRole('textbox', { name: 'Nombre' }).fill('Gio Pack')
  await page.getByRole('textbox', { name: 'Razón social' }).fill('')
  await page.getByRole('textbox', { name: 'CUIT' }).fill('')
  await page.getByRole('textbox', { name: 'Teléfono' }).fill('')
  await page.getByLabel('Inicio de actividades').fill('')
  await page.getByRole('button', { name: 'Condición frente al IVA' }).click()
  await page.getByRole('option', { name: 'Sin especificar' }).click()
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByText('Datos del negocio guardados', { exact: true })).toBeVisible()

  const saved = await callApi<Record<string, unknown>>(userId, 'GET', '/business')
  expect(saved).toMatchObject({
    name: 'Gio Pack',
    legalName: null,
    cuit: null,
    vatCondition: null,
    phone: null,
    activityStartDate: null
  })
})
