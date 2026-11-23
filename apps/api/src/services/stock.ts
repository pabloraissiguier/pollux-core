import type { initialCountSchema, StockShortageList, stockAdjustmentSchema, stockMovementListQuerySchema, stockShortageListQuerySchema } from '@pollux/contracts'
import { branches, customers, orderLines, orders, products, profiles, purchases, stockMovements } from '@pollux/db/schema'
import { and, asc, count, desc, eq, inArray, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database, Transaction } from '../db'
import { getProduct, isProduct, productNotFound } from './products'

type ValidStockAdjustment = z.output<typeof stockAdjustmentSchema>
type ValidInitialCount = z.output<typeof initialCountSchema>
type ValidStockMovementListQuery = z.output<typeof stockMovementListQuerySchema>
type ValidStockShortageListQuery = z.output<typeof stockShortageListQuerySchema>

/** A Stock movement to record; its type says which of the cause fields it carries. */
export type StockMovementInput = {
  productId: string
  /** Signed: positive adds On-hand stock, negative removes it. Never zero. */
  quantity: number
  createdBy: string
} & (
  | { type: 'adjustment', adjustmentReason: ValidStockAdjustment['reason'], notes?: string | null }
  | { type: 'order_delivered' | 'delivery_undone', orderId: string }
  | { type: 'purchase', purchaseId: string }
)

/**
 * Locks the given Products (`FOR UPDATE`, in id order so concurrent callers can't deadlock) and
 * returns their On-hand stock by id. Throws 404 when any of them isn't in this business.
 */
export async function lockProducts(tx: Transaction, businessId: string, productIds: string[]) {
  const ids = [...new Set(productIds)].sort()
  const rows = await tx
    .select({ id: products.id, stockOnHand: products.stockOnHand })
    .from(products)
    .where(and(eq(products.businessId, businessId), inArray(products.id, ids)))
    .orderBy(asc(products.id))
    .for('update')
  if (rows.length !== ids.length) throw productNotFound()
  return new Map(rows.map(r => [r.id, r.stockOnHand]))
}

/**
 * Records Stock movements and moves each Product's cached On-hand stock by the same quantity.
 * Call it inside the transaction of the action that caused them, after `lockProducts`.
 */
export async function recordStockMovements(tx: Transaction, businessId: string, movements: StockMovementInput[]) {
  if (movements.length === 0) return
  await tx.insert(stockMovements).values(movements.map(m => ({ ...m, businessId })))
  for (const { productId, quantity } of movements) {
    await tx
      .update(products)
      .set({ stockOnHand: sql`${products.stockOnHand} + ${quantity}` })
      .where(isProduct(businessId, productId))
  }
}

/** Ajuste de stock: changes one Product's On-hand stock, and answers with the Product. */
export async function adjustStock(db: Database, businessId: string, profileId: string, input: ValidStockAdjustment) {
  return db.transaction(async (tx) => {
    await lockProducts(tx, businessId, [input.productId])
    await recordStockMovements(tx, businessId, [{
      type: 'adjustment',
      productId: input.productId,
      quantity: input.quantity,
      adjustmentReason: input.reason,
      notes: input.notes,
      createdBy: profileId,
    }])
    return getProduct(tx, businessId, input.productId)
  })
}

/**
 * Bulk initial count: sets each Product's On-hand stock to its counted quantity, recording the
 * difference as an `initial_count` Stock adjustment. A Product already at its count gets no
 * movement. All or nothing: one Product outside this business fails the whole count with 404.
 * Answers each Product, in the order given, with the difference applied.
 */
export async function recordInitialCount(db: Database, businessId: string, profileId: string, input: ValidInitialCount) {
  return db.transaction(async (tx) => {
    const onHand = await lockProducts(tx, businessId, input.items.map(i => i.productId))
    const differences = input.items.map(({ productId, quantity }) => ({ productId, difference: quantity - onHand.get(productId)! }))

    await recordStockMovements(tx, businessId, differences
      .filter(c => c.difference !== 0)
      .map(c => ({
        type: 'adjustment' as const,
        productId: c.productId,
        quantity: c.difference,
        adjustmentReason: 'initial_count' as const,
        createdBy: profileId,
      })))

    const items = []
    for (const { productId, difference } of differences) {
      items.push({ product: await getProduct(tx, businessId, productId), difference })
    }
    return { items }
  })
}

/**
 * A Product's Stock movements, newest first. Each carries its type, signed quantity and cause:
 * the adjustment reason and notes, the Order (with its number) or the Purchase (with its invoice
 * number), plus who recorded it.
 */
export async function listStockMovements(db: Database, businessId: string, query: ValidStockMovementListQuery) {
  const { productId, limit, offset } = query
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(isProduct(businessId, productId))
  if (!product) throw productNotFound()

  const where = and(eq(stockMovements.businessId, businessId), eq(stockMovements.productId, productId))
  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: stockMovements.id,
        type: stockMovements.type,
        quantity: stockMovements.quantity,
        reason: stockMovements.adjustmentReason,
        notes: stockMovements.notes,
        orderId: orders.id,
        orderNumber: orders.number,
        purchaseId: purchases.id,
        purchaseInvoiceNumber: purchases.invoiceNumber,
        createdById: profiles.id,
        createdByName: profiles.fullName,
        createdAt: stockMovements.createdAt,
      })
      .from(stockMovements)
      .leftJoin(orders, and(eq(orders.businessId, businessId), eq(orders.id, stockMovements.orderId)))
      .leftJoin(purchases, and(eq(purchases.businessId, businessId), eq(purchases.id, stockMovements.purchaseId)))
      .leftJoin(profiles, eq(profiles.id, stockMovements.createdBy))
      .where(where)
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(stockMovements).where(where),
  ])

  return {
    items: rows.map(r => ({
      id: r.id,
      type: r.type,
      quantity: r.quantity,
      reason: r.reason,
      notes: r.notes,
      order: r.orderId ? { id: r.orderId, number: r.orderNumber! } : null,
      purchase: r.purchaseId ? { id: r.purchaseId, invoiceNumber: r.purchaseInvoiceNumber } : null,
      createdBy: r.createdById ? { id: r.createdById, fullName: r.createdByName } : null,
      createdAt: r.createdAt,
    })),
    total: counted!.total,
  }
}

/**
 * Stock shortages: every Product (Inactive ones included) whose Available stock is below zero,
 * largest shortfall first (then by Code), each with the Pending Orders that have a line for it.
 */
export async function listStockShortages(db: Database, businessId: string, query: ValidStockShortageListQuery): Promise<StockShortageList> {
  const { limit, offset } = query
  // Reserved stock by the same rule as `reservedStock()` (lines of Pending Orders), aggregated
  // once and joined, rather than as a correlated subquery per Product.
  const pendingLines = db
    .select({
      productId: orderLines.productId,
      quantity: sql<number>`sum(${orderLines.quantity})::int`.as('quantity'),
    })
    .from(orderLines)
    .innerJoin(orders, and(eq(orders.businessId, businessId), eq(orders.id, orderLines.orderId)))
    .where(and(eq(orderLines.businessId, businessId), eq(orders.status, 'pending')))
    .groupBy(orderLines.productId)
    .as('pending_lines')
  const reserved = sql<number>`coalesce(${pendingLines.quantity}, 0)`.mapWith(Number)
  const shortfall = sql<number>`${reserved} - ${products.stockOnHand}`
  const where = and(eq(products.businessId, businessId), sql`${shortfall} > 0`)

  const [rows, [counted]] = await Promise.all([
    db
      .select({
        id: products.id,
        code: products.code,
        name: products.name,
        onHand: products.stockOnHand,
        reserved,
      })
      .from(products)
      .leftJoin(pendingLines, eq(pendingLines.productId, products.id))
      .where(where)
      .orderBy(desc(shortfall), asc(products.code), asc(products.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(products)
      .leftJoin(pendingLines, eq(pendingLines.productId, products.id))
      .where(where),
  ])

  const reserving = await pendingOrdersFor(db, businessId, rows.map(r => r.id))

  return {
    items: rows.map(r => ({
      product: { id: r.id, code: r.code, name: r.name },
      stock: { onHand: r.onHand, reserved: r.reserved, available: r.onHand - r.reserved },
      shortfall: r.reserved - r.onHand,
      orders: reserving
        .filter(o => o.productId === r.id)
        .map(o => ({
          id: o.id,
          number: o.number,
          deliveryDate: o.deliveryDate,
          customer: { id: o.customerId, name: o.customerName },
          branch: { city: o.branchCity },
          quantity: o.quantity,
        })),
    })),
    total: counted!.total,
  }
}

/**
 * The Pending Orders with a line for any of the given Products, one row per Order and Product
 * (an Order with two lines of a Product sums them), soonest Delivery date first.
 */
async function pendingOrdersFor(db: Database, businessId: string, productIds: string[]) {
  if (productIds.length === 0) return []
  return db
    .select({
      productId: orderLines.productId,
      id: orders.id,
      number: orders.number,
      deliveryDate: orders.deliveryDate,
      customerId: customers.id,
      customerName: customers.name,
      branchCity: branches.city,
      quantity: sql<number>`sum(${orderLines.quantity})::int`.mapWith(Number),
    })
    .from(orderLines)
    .innerJoin(orders, and(eq(orders.businessId, businessId), eq(orders.id, orderLines.orderId)))
    .innerJoin(customers, and(eq(customers.businessId, businessId), eq(customers.id, orders.customerId)))
    .innerJoin(branches, and(eq(branches.businessId, businessId), eq(branches.id, orders.branchId)))
    .where(and(
      eq(orderLines.businessId, businessId),
      inArray(orderLines.productId, productIds),
      eq(orders.status, 'pending'),
    ))
    .groupBy(orderLines.productId, orders.id, customers.id, branches.id)
    .orderBy(asc(orders.deliveryDate), asc(orders.number))
}
