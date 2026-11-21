import { createCategory, createProduct } from './catalog'
import { expect, test } from './fixtures'

test('the owner creates a Product, changes its Price and sees the price history', { tag: '@desktop' }, async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createCategory(page, 'Descartables')

  await page.goto('/productos')
  await page.getByRole('link', { name: 'Nuevo producto' }).click()
  await page.getByRole('textbox', { name: 'Código' }).fill('VAS-180')
  await page.getByRole('textbox', { name: 'Nombre' }).fill('Vaso térmico 180 cc x 50')
  await page.getByRole('textbox', { name: 'Marca' }).fill('Dart')
  await page.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: 'Descartables' }).click()
  await page.getByRole('textbox', { name: 'Precio' }).fill('1234,50')
  await page.getByRole('button', { name: 'Crear producto' }).click()

  await expect(page.getByRole('heading', { name: 'Vaso térmico 180 cc x 50', level: 1 })).toBeVisible()
  await expect(page.getByText('$ 1.234,50').first()).toBeVisible()
  await expect(page.getByText('21 %')).toBeVisible()

  await page.getByRole('button', { name: 'Cambiar precio' }).click()
  const dialog = page.getByRole('dialog', { name: 'Cambiar precio' })
  await dialog.getByRole('textbox', { name: 'Precio nuevo' }).fill('1.500,00')
  await dialog.getByRole('button', { name: 'Guardar precio' }).click()
  await expect(dialog).toBeHidden()

  const history = page.getByRole('region', { name: 'Historial de precios' })
  const changes = history.getByRole('listitem')
  await expect(changes).toHaveCount(2)
  await expect(changes.first()).toContainText('$ 1.234,50')
  await expect(changes.first()).toContainText('$ 1.500,00')
  await expect(changes.last()).toContainText('Precio inicial')

  // The catalog shows the new Price under the Product's Category.
  await page.goto('/productos')
  const row = page.getByRole('link', { name: /Vaso térmico 180 cc x 50/ })
  await expect(row).toContainText('$ 1.500,00')
  await expect(row).toContainText('Descartables')
})

test('the owner edits a Product and makes it Inactive, and the catalog hides it until asked', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createCategory(page, 'Bolsas')
  await createProduct(page, { code: 'BOL-01', name: 'Bolsa camiseta 40x50', price: '800' })

  await page.getByRole('button', { name: 'Editar' }).click()
  const dialog = page.getByRole('dialog', { name: 'Editar producto' })
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Bolsa camiseta 45x60')
  await dialog.getByRole('textbox', { name: 'Marca' }).fill('Plastiflex')
  await dialog.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: 'Bolsas' }).click()
  await dialog.getByRole('combobox', { name: 'Alícuota de IVA' }).click()
  await page.getByRole('option', { name: '10,5 %' }).click()
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Bolsa camiseta 45x60', level: 1 })).toBeVisible()
  await expect(page.getByText('Plastiflex')).toBeVisible()
  await expect(page.getByText('10,5 %')).toBeVisible()
  await expect(page.getByRole('definition').filter({ hasText: 'Bolsas' })).toBeVisible()

  // Taking it out of its Category.
  await page.getByRole('button', { name: 'Editar' }).click()
  await dialog.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: 'Sin categoría' }).click()
  await dialog.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('definition').filter({ hasText: 'Sin categoría' })).toBeVisible()

  await page.getByRole('switch', { name: 'Activo', exact: true }).click()
  await expect(page.getByText('Producto desactivado', { exact: true })).toBeVisible()
  await expect(page.getByRole('switch', { name: 'Activo', exact: true })).not.toBeChecked()

  await page.goto('/productos')
  await expect(page.getByText('Todavía no hay productos')).toBeVisible()
  await page.getByRole('switch', { name: 'Mostrar inactivos' }).click()
  const row = page.getByRole('link', { name: /Bolsa camiseta 45x60/ })
  await expect(row).toContainText('Inactivo')

  // Reactivating brings it back to the catalog.
  await row.click()
  await page.getByRole('switch', { name: 'Activo', exact: true }).click()
  await expect(page.getByText('Producto reactivado', { exact: true })).toBeVisible()
  await page.goto('/productos')
  await expect(page.getByRole('link', { name: /Bolsa camiseta 45x60/ })).not.toContainText('Inactivo')
})

test('the owner browses the catalog by Category and searches it', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createCategory(page, 'Descartables')
  await createCategory(page, 'Limpieza')
  await createProduct(page, { code: 'VAS-180', name: 'Vaso térmico 180 cc', category: 'Descartables', price: '1500' })
  await createProduct(page, { code: 'LAV-1', name: 'Lavandina 1 L', category: 'Limpieza', price: '950,25' })

  await page.goto('/productos')
  await page.getByRole('button', { name: 'Categoría' }).click()
  await page.getByRole('option', { name: 'Limpieza' }).click()
  await expect(page.getByRole('link', { name: /Lavandina 1 L/ })).toContainText('$ 950,25')
  await expect(page.getByRole('link', { name: /Vaso térmico/ })).toHaveCount(0)

  // A Category on the Categories screen opens the catalog filtered by it.
  await page.goto('/productos/categorias')
  await page.getByRole('link', { name: 'Descartables', exact: true }).click()
  await expect(page.getByRole('link', { name: /Vaso térmico 180 cc/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Lavandina/ })).toHaveCount(0)

  await page.goto('/productos')
  await page.getByRole('searchbox', { name: 'Buscar por nombre, código o marca' }).fill('lav-1')
  await expect(page.getByRole('link', { name: /Lavandina 1 L/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /Vaso térmico/ })).toHaveCount(0)
})

test('the owner renames a Category', async ({ page, createOwner, signIn }) => {
  const userId = await createOwner('Gio Pack')
  await signIn(userId)
  await expect(page).toHaveURL('/')
  await createCategory(page, 'Limpiesa')

  await page.getByRole('button', { name: 'Renombrar Limpiesa' }).click()
  const dialog = page.getByRole('dialog', { name: 'Renombrar categoría' })
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Limpieza')
  await dialog.getByRole('button', { name: 'Guardar nombre' }).click()

  await expect(page.getByRole('link', { name: 'Limpieza', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Limpiesa', exact: true })).toHaveCount(0)

  // A name already in use is refused with the API's message.
  await createCategory(page, 'Bolsas')
  await page.getByRole('button', { name: 'Renombrar Bolsas' }).click()
  await dialog.getByRole('textbox', { name: 'Nombre' }).fill('Limpieza')
  await dialog.getByRole('button', { name: 'Guardar nombre' }).click()
  await expect(page.getByText('Ya existe una categoría con ese nombre', { exact: true })).toBeVisible()
})
