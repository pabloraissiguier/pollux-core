import { changeByPercent } from '@pollux/contracts'
import type { categoryPriceUpdateSchema } from '@pollux/contracts'
import { categories, products } from '@pollux/db/schema'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database, DbOrTx } from '../db'
import { ApiError } from '../errors'
import { recordPriceChange } from './products'

type ValidCategoryPriceUpdate = z.output<typeof categoryPriceUpdateSchema>

/**
 * The Category and each of its Active Products with its current and new Price, by name.
 * With `lock`, the Product rows are locked `FOR UPDATE` (in id order, so two updates of the same
 * Category can't deadlock) for the transaction that applies the change.
 */
async function planPriceUpdate(
  db: DbOrTx,
  businessId: string,
  categoryId: string,
  percent: string,
  { lock }: { lock: boolean },
) {
  const [category] = await db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(and(eq(categories.businessId, businessId), eq(categories.id, categoryId)))
  if (!category) throw new ApiError(404, 'category_not_found', 'No encontramos la categoría')

  const select = db
    .select({ productId: products.id, code: products.code, name: products.name, oldPrice: products.price })
    .from(products)
    .where(and(eq(products.businessId, businessId), eq(products.categoryId, categoryId), eq(products.isActive, true)))
    .orderBy(asc(products.id))
  const rows = lock ? await select.for('update') : await select

  const items = rows
    .map(row => ({ ...row, newPrice: changeByPercent(row.oldPrice, percent) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es') || a.productId.localeCompare(b.productId))
  return { category, percent, items }
}

/** What a Category Price update would do, without writing anything. */
export function previewCategoryPriceUpdate(
  db: Database,
  businessId: string,
  categoryId: string,
  { percent }: ValidCategoryPriceUpdate,
) {
  return planPriceUpdate(db, businessId, categoryId, percent, { lock: false })
}

/**
 * Raises or lowers every Active Product in the Category by `percent`, in one transaction, and
 * keeps each Price change in the Product's price history. Inactive Products are untouched, and
 * a Product whose Price doesn't change after rounding gets no history row.
 */
export async function applyCategoryPriceUpdate(
  db: Database,
  businessId: string,
  profileId: string,
  categoryId: string,
  { percent }: ValidCategoryPriceUpdate,
) {
  return db.transaction(async (tx) => {
    const plan = await planPriceUpdate(tx, businessId, categoryId, percent, { lock: true })
    for (const { productId, oldPrice, newPrice } of plan.items) {
      if (newPrice === oldPrice) continue
      await tx
        .update(products)
        .set({ price: newPrice, updatedAt: sql`now()` })
        .where(and(eq(products.businessId, businessId), eq(products.id, productId)))
      await recordPriceChange(tx, { businessId, productId, oldPrice, newPrice, changedBy: profileId })
    }
    return plan
  })
}
