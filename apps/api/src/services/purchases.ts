import { multiplyMoney, sumMoney } from '@pollux/contracts'
import type { purchaseCreateSchema, purchaseListQuerySchema } from '@pollux/contracts'
import { products, profiles, purchaseLines, purchases, suppliers } from '@pollux/db/schema'
import { and, asc, count, desc, eq, gte, inArray, lte } from 'drizzle-orm'
import type { z } from 'zod'
import { today } from '../dates'
import type { Database, DbOrTx } from '../db'
import { ApiError } from '../errors'
import { lockProducts, recordStockMovements } from './stock'
import { assertSupplier } from './suppliers'

type ValidPurchaseCreate = z.output<typeof purchaseCreateSchema>
type ValidPurchaseListQuery = z.output<typeof purchaseListQuerySchema>

const purchaseNotFound = () => new ApiError(404, 'purchase_not_found', 'No encontramos la compra')

/**
 * The given Purchases (in the order given), each as
 * `{ id, supplier, purchasedOn, invoiceNumber, notes, createdBy, createdAt, lines, total }`.
 * Line subtotals and the total are computed on read with the contracts' money helpers.
 */
async function loadPurchases(db: DbOrTx, businessId: string, ids: string[]) {
  if (ids.length === 0) return []
  const [heads, lineRows] = await Promise.all([
    db
      .select({
        id: purchases.id,
        supplierId: suppliers.id,
        supplierName: suppliers.name,
        purchasedOn: purchases.purchasedOn,
        invoiceNumber: purchases.invoiceNumber,
        notes: purchases.notes,
        createdById: profiles.id,
        createdByName: profiles.fullName,
        createdAt: purchases.createdAt,
      })
      .from(purchases)
      .innerJoin(suppliers, and(eq(suppliers.businessId, businessId), eq(suppliers.id, purchases.supplierId)))
      .leftJoin(profiles, eq(profiles.id, purchases.createdBy))
      .where(and(eq(purchases.businessId, businessId), inArray(purchases.id, ids))),
    db
      .select({
        id: purchaseLines.id,
        purchaseId: purchaseLines.purchaseId,
        productId: products.id,
        productCode: products.code,
        productName: products.name,
        quantity: purchaseLines.quantity,
        unitCost: purchaseLines.unitCost,
      })
      .from(purchaseLines)
      .innerJoin(products, and(eq(products.businessId, businessId), eq(products.id, purchaseLines.productId)))
      .where(and(eq(purchaseLines.businessId, businessId), inArray(purchaseLines.purchaseId, ids)))
      .orderBy(asc(purchaseLines.position), asc(purchaseLines.id)),
  ])

  const byId = new Map(heads.map(h => [h.id, h]))
  return ids.flatMap((id) => {
    const head = byId.get(id)
    if (!head) return []
    const lines = lineRows
      .filter(l => l.purchaseId === id)
      .map(l => ({
        id: l.id,
        product: { id: l.productId, code: l.productCode, name: l.productName },
        quantity: l.quantity,
        unitCost: l.unitCost,
        subtotal: multiplyMoney(l.unitCost, l.quantity),
      }))
    return [{
      id: head.id,
      supplier: { id: head.supplierId, name: head.supplierName },
      purchasedOn: head.purchasedOn,
      invoiceNumber: head.invoiceNumber,
      notes: head.notes,
      createdBy: head.createdById ? { id: head.createdById, fullName: head.createdByName } : null,
      createdAt: head.createdAt,
      lines,
      total: sumMoney(lines.map(l => l.subtotal)),
    }]
  })
}

/** One Purchase with its lines and total, or 404 when it isn't in this business. */
export async function getPurchase(db: DbOrTx, businessId: string, purchaseId: string) {
  const [purchase] = await loadPurchases(db, businessId, [purchaseId])
  if (!purchase) throw purchaseNotFound()
  return purchase
}

/**
 * Registers a Purchase. One transaction inserts it, its lines and one `purchase` Stock movement
 * per line, raising each Product's On-hand stock. Inactive Products may be bought.
 * All or nothing: a Supplier or Product outside this business fails it with 404.
 */
export async function createPurchase(db: Database, businessId: string, profileId: string, input: ValidPurchaseCreate) {
  return db.transaction(async (tx) => {
    await assertSupplier(tx, businessId, input.supplierId)
    await lockProducts(tx, businessId, input.lines.map(l => l.productId))

    const [purchase] = await tx
      .insert(purchases)
      .values({
        businessId,
        supplierId: input.supplierId,
        purchasedOn: input.purchasedOn ?? today(),
        invoiceNumber: input.invoiceNumber,
        notes: input.notes,
        createdBy: profileId,
      })
      .returning({ id: purchases.id })
    const purchaseId = purchase!.id

    await tx.insert(purchaseLines).values(input.lines.map((line, position) => ({ ...line, businessId, purchaseId, position })))
    await recordStockMovements(tx, businessId, input.lines.map(line => ({
      type: 'purchase' as const,
      productId: line.productId,
      quantity: line.quantity,
      purchaseId,
      createdBy: profileId,
    })))
    return getPurchase(tx, businessId, purchaseId)
  })
}

/** Purchases by Supplier and Purchase date (both ends inclusive), latest first. */
export async function listPurchases(db: Database, businessId: string, query: ValidPurchaseListQuery) {
  const { supplierId, from, to, limit, offset } = query
  const where = and(
    eq(purchases.businessId, businessId),
    supplierId ? eq(purchases.supplierId, supplierId) : undefined,
    from ? gte(purchases.purchasedOn, from) : undefined,
    to ? lte(purchases.purchasedOn, to) : undefined,
  )
  const [rows, [counted]] = await Promise.all([
    db
      .select({ id: purchases.id })
      .from(purchases)
      .where(where)
      .orderBy(desc(purchases.purchasedOn), desc(purchases.createdAt), desc(purchases.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(purchases).where(where),
  ])
  return { items: await loadPurchases(db, businessId, rows.map(r => r.id)), total: counted!.total }
}
