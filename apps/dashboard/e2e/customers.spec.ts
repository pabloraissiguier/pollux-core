import { expect, test } from './fixtures'

test('the owner creates a Customer with a Branch and finds it by search', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto('/clientes')
  await page.getByRole('link', { name: 'Nuevo cliente' }).click()
  await expect(page).toHaveURL('/clientes/nuevo')

  await page.getByRole('textbox', { name: 'Nombre' }).fill('Almacén Don José')
  const cuit = page.getByRole('textbox', { name: 'CUIT' })
  await cuit.pressSequentially('20123456786')
  await expect(cuit).toHaveValue('20-12345678-6')
  await page.getByRole('textbox', { name: 'Dirección' }).fill('San Martín 123')
  await page.getByRole('textbox', { name: 'Localidad' }).fill('Corral de Bustos')
  await page.getByRole('button', { name: 'Guardar cliente' }).click()

  await expect(page).toHaveURL(/\/clientes\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { name: 'Almacén Don José', level: 1 })).toBeVisible()
  await expect(page.getByText('San Martín 123')).toBeVisible()

  await page.goto('/clientes')
  await page.getByRole('searchbox', { name: 'Buscar por nombre o CUIT' }).fill('don jos')
  await expect(page.getByRole('link', { name: /Almacén Don José/ })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Buscar por nombre o CUIT' }).fill('20123456786')
  await expect(page.getByRole('link', { name: /Almacén Don José/ })).toBeVisible()

  await page.getByRole('searchbox', { name: 'Buscar por nombre o CUIT' }).fill('otro nombre')
  await expect(page.getByText('No encontramos clientes')).toBeVisible()
  await expect(page.getByRole('link', { name: /Almacén Don José/ })).toHaveCount(0)
})

test('the owner filters Customers by town', async ({ page, createOwner, signIn, createCustomer }) => {
  const userId = await createOwner('Gio Pack')
  await createCustomer(userId, { name: 'Kiosco La Esquina', branches: [{ address: 'Belgrano 50', city: 'Corral de Bustos' }] })
  await createCustomer(userId, { name: 'Supermercado Isla', branches: [{ address: 'Mitre 900', city: 'Isla Verde' }] })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto('/clientes')
  await expect(page.getByRole('link', { name: /Kiosco La Esquina/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Supermercado Isla/ })).toBeVisible()

  await page.getByRole('button', { name: 'Localidad' }).click()
  await page.getByRole('option', { name: 'Isla Verde' }).click()

  await expect(page.getByRole('link', { name: /Supermercado Isla/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Kiosco La Esquina/ })).toHaveCount(0)
  await expect(page).toHaveURL('/clientes?localidad=Isla+Verde')
})

test('a wrong CUIT is caught before saving', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto('/clientes/nuevo')
  await page.getByRole('textbox', { name: 'Nombre' }).fill('Almacén Don José')
  await page.getByRole('textbox', { name: 'CUIT' }).fill('20-12345678-0')
  await page.getByRole('textbox', { name: 'Dirección' }).fill('San Martín 123')
  await page.getByRole('textbox', { name: 'Localidad' }).fill('Corral de Bustos')
  await page.getByRole('button', { name: 'Guardar cliente' }).click()

  await expect(page.getByText('El CUIT no es válido')).toBeVisible()
  await expect(page).toHaveURL('/clientes/nuevo')
})

test('the owner calls a Customer, edits their details and keeps their Branches up to date', async ({ page, createOwner, signIn, createCustomer }) => {
  const userId = await createOwner('Gio Pack')
  const customerId = await createCustomer(userId, {
    name: 'Kiosco La Esquina',
    phone: '03468 15-123456',
    branches: [{ address: 'Belgrano 50', city: 'Corral de Bustos' }]
  })
  await signIn(userId)
  await expect(page).toHaveURL('/')

  await page.goto(`/clientes/${customerId}`)
  await expect(page.getByRole('heading', { name: 'Kiosco La Esquina', level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Llamar al 03468 15-123456' })).toHaveAttribute('href', 'tel:0346815123456')
  await expect(page.getByText('Saldo', { exact: true })).toBeVisible()

  // Details
  await page.getByRole('button', { name: 'Editar', exact: true }).click()
  const details = page.getByRole('dialog', { name: 'Editar cliente' })
  await details.getByRole('textbox', { name: 'Nombre' }).fill('Kiosco La Nueva Esquina')
  await details.getByRole('textbox', { name: 'CUIT' }).pressSequentially('30712345671')
  await details.getByRole('combobox', { name: 'Condición frente al IVA' }).click()
  await page.getByRole('option', { name: 'Monotributo' }).click()
  await details.getByRole('button', { name: 'Guardar cambios' }).click()

  await expect(details).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Kiosco La Nueva Esquina', level: 1 })).toBeVisible()
  await expect(page.getByText('30-71234567-1')).toBeVisible()
  await expect(page.getByText('Monotributo')).toBeVisible()

  // A second Branch
  await page.getByRole('button', { name: 'Agregar sucursal' }).click()
  const newBranch = page.getByRole('dialog', { name: 'Agregar sucursal' })
  await newBranch.getByRole('textbox', { name: 'Dirección' }).fill('Ruta 8 km 300')
  await newBranch.getByRole('textbox', { name: 'Localidad' }).fill('Isla Verde')
  await newBranch.getByRole('button', { name: 'Agregar sucursal' }).click()
  await expect(newBranch).toHaveCount(0)
  await expect(page.getByText('Ruta 8 km 300')).toBeVisible()

  // Editing the first one
  await page.getByRole('button', { name: 'Editar sucursal Belgrano 50' }).click()
  const branch = page.getByRole('dialog', { name: 'Editar sucursal' })
  await expect(branch.getByRole('textbox', { name: 'Dirección' })).toHaveValue('Belgrano 50')
  await branch.getByRole('textbox', { name: 'Dirección' }).fill('Belgrano 52')
  await branch.getByRole('textbox', { name: 'Nombre de la sucursal' }).fill('Local centro')
  await branch.getByRole('button', { name: 'Guardar sucursal' }).click()
  await expect(branch).toHaveCount(0)
  await expect(page.getByText('Belgrano 52')).toBeVisible()
  await expect(page.getByText('Local centro')).toBeVisible()

  // The list shows the new name and both towns.
  await page.getByRole('link', { name: 'Volver a clientes' }).click()
  await expect(page.getByRole('link', { name: /Kiosco La Nueva Esquina.*Corral de Bustos, Isla Verde/ })).toBeVisible()
})
