import { changeByPercent } from '@pollux/contracts'
import type { categoryPriceUpdateSchema } from '@pollux/contracts'
import { products } from '@pollux/db/schema'
import { and, asc, eq } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database, DbOrTx } from '../db'
import { getCategory } from './categories'
import { changePrice } from './products'

type ValidCategoryPriceUpdate = z.output<typeof categoryPriceUpdateSchema>

const activeInCategory = (businessId: string, categoryId: string) =>
  and(eq(products.businessId, businessId), eq(products.categoryId, categoryId), eq(products.isActive, true))

/** The Category and each of its Active Products with its current and new Price, by name. */
async function planPriceUpdate(db: DbOrTx, businessId: string, categoryId: string, percent: string) {
  const category = await getCategory(db, businessId, categoryId)
  const rows = await db
    .select({ productId: products.id, code: products.code, name: products.name, oldPrice: products.price })
    .from(products)
    .where(activeInCategory(businessId, categoryId))
    .orderBy(asc(products.name), asc(products.id))
  const items = rows.map(row => ({ ...row, newPrice: changeByPercent(row.oldPrice, percent) }))
  return { category, percent, items }
}

/** What a Category Price update would do, without writing anything. */
export function previewCategoryPriceUpdate(
  db: Database,
  businessId: string,
  categoryId: string,
  { percent }: ValidCategoryPriceUpdate,
) {
  return planPriceUpdate(db, businessId, categoryId, percent)
}

/**
 * Raises or lowers every Active Product in the Category by `percent`, in one transaction, and
 * keeps each Price change in the Product's price history. The Products are locked first, in id
 * order so two updates of the same Category can't deadlock. Inactive Products are untouched, and
 * a Product whose Price doesn't change after rounding gets no write and no history row.
 */
export async function applyCategoryPriceUpdate(
  db: Database,
  businessId: string,
  profileId: string,
  categoryId: string,
  { percent }: ValidCategoryPriceUpdate,
) {
  return db.transaction(async (tx) => {
    await tx
      .select({ id: products.id })
      .from(products)
      .where(activeInCategory(businessId, categoryId))
      .orderBy(asc(products.id))
      .for('update')
    const plan = await planPriceUpdate(tx, businessId, categoryId, percent)
    for (const { productId, oldPrice, newPrice } of plan.items) {
      if (newPrice !== oldPrice) {
        await changePrice(tx, { businessId, productId, oldPrice, newPrice, changedBy: profileId })
      }
    }
    return plan
  })
}
