import { lineSubtotal, orderTotals } from '@pollux/contracts'
import type { orderCreateSchema, orderListQuerySchema, orderUpdateSchema } from '@pollux/contracts'
import { branches, customers, orderLines, orders, products } from '@pollux/db/schema'
import { and, asc, count, desc, eq, inArray, notInArray, sql } from 'drizzle-orm'
import type { z } from 'zod'
import type { Database, DbOrTx, Transaction } from '../db'
import { ApiError } from '../errors'
import { assertCustomer } from './customers'
import { orderPayments } from './payments'
import { reservedStock } from './products'
import { nextNumber } from './sequences'
import { lockProducts } from './stock'

type ValidOrderCreate = z.output<typeof orderCreateSchema>
type ValidOrderUpdate = z.output<typeof orderUpdateSchema>
type ValidOrderListQuery = z.output<typeof orderListQuerySchema>
type ValidOrderLine = ValidOrderCreate['lines'][number]

export const orderNotFound = () => new ApiError(404, 'order_not_found', 'No encontramos el pedido')
const branchNotOfCustomer = () =>
  new ApiError(400, 'branch_not_of_customer', 'La sucursal no es de este cliente')
const orderNotPending = () =>
  new ApiError(409, 'order_not_pending', 'Solo se puede modificar o cancelar un pedido pendiente')
const orderLineNotFound = () =>
  new ApiError(404, 'order_line_not_found', 'Una de las líneas no es de este pedido')
const orderLineProductChanged = () =>
  new ApiError(400, 'order_line_product_changed', 'No se puede cambiar el producto de una línea: quitala y agregá una nueva')
const productInactive = (name: string) =>
  new ApiError(409, 'product_inactive', `El producto «${name}» está inactivo y no se puede vender`)

export const isOrder = (businessId: string, orderId: string) =>
  and(eq(orders.businessId, businessId), eq(orders.id, orderId))

const orderColumns = {
  id: orders.id,
  number: orders.number,
  status: orders.status,
  customerId: customers.id,
  customerName: customers.name,
  branchId: branches.id,
  branchName: branches.name,
  branchAddress: branches.address,
  branchCity: branches.city,
  deliveryDate: orders.deliveryDate,
  deliveredOn: orders.deliveredOn,
  discountPercent: orders.discountPercent,
  notes: orders.notes,
  deliveryNoteNumber: orders.deliveryNoteNumber,
  cancelledAt: orders.cancelledAt,
  createdAt: orders.createdAt,
  updatedAt: orders.updatedAt,
}

/** Orders joined to their Customer and Branch, in this business. */
function selectOrders(db: DbOrTx, businessId: string) {
  return db
    .select(orderColumns)
    .from(orders)
    .innerJoin(customers, and(eq(customers.businessId, businessId), eq(customers.id, orders.customerId)))
    .innerJoin(branches, and(eq(branches.businessId, businessId), eq(branches.id, orders.branchId)))
}

type OrderRow = Awaited<ReturnType<typeof selectOrders>>[number]

/** The lines of the given Orders, in their entered order, each with its Product. */
export async function selectLines(db: DbOrTx, businessId: string, orderIds: string[]) {
  if (orderIds.length === 0) return []
  return db
    .select({
      id: orderLines.id,
      orderId: orderLines.orderId,
      productId: products.id,
      productCode: products.code,
      productName: products.name,
      quantity: orderLines.quantity,
      unitPrice: orderLines.unitPrice,
      discountPercent: orderLines.discountPercent,
    })
    .from(orderLines)
    .innerJoin(products, and(eq(products.businessId, businessId), eq(products.id, orderLines.productId)))
    .where(and(eq(orderLines.businessId, businessId), inArray(orderLines.orderId, orderIds)))
    .orderBy(asc(orderLines.position), asc(orderLines.id))
}

type LineRow = Awaited<ReturnType<typeof selectLines>>[number]

/** An Order line as the API shows it, with its subtotal. */
export function toLine(l: LineRow) {
  return {
    id: l.id,
    product: { id: l.productId, code: l.productCode, name: l.productName },
    quantity: l.quantity,
    unitPrice: l.unitPrice,
    discountPercent: l.discountPercent,
    subtotal: lineSubtotal(l),
  }
}

/** The Order as the API shows it. Totals are computed on read, never stored. */
function toOrder(row: OrderRow, lineRows: LineRow[]) {
  const lines = lineRows.map(toLine)
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    customer: { id: row.customerId, name: row.customerName },
    branch: { id: row.branchId, name: row.branchName, address: row.branchAddress, city: row.branchCity },
    deliveryDate: row.deliveryDate,
    deliveredOn: row.deliveredOn,
    discountPercent: row.discountPercent,
    notes: row.notes,
    deliveryNoteNumber: row.deliveryNoteNumber,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lines,
    totals: orderTotals(lineRows, row.discountPercent),
  }
}

/**
 * One Order with its lines, totals and the Payments noted against it (newest first, voided ones
 * included), or 404 when it isn't in this business.
 */
export async function getOrder(db: DbOrTx, businessId: string, orderId: string) {
  const [row] = await selectOrders(db, businessId).where(isOrder(businessId, orderId))
  if (!row) throw orderNotFound()
  const [lineRows, payments] = await Promise.all([
    selectLines(db, businessId, [orderId]),
    orderPayments(db, businessId, orderId),
  ])
  return { ...toOrder(row, lineRows), payments }
}

/**
 * The Order plus a warning for each line whose Product is left with negative Available stock.
 * Warnings never block: Orders are taken even when stock is short.
 */
async function withStockWarnings(tx: Transaction, businessId: string, orderId: string) {
  const order = await getOrder(tx, businessId, orderId)
  const productIds = [...new Set(order.lines.map(l => l.product.id))]
  const stock = await tx
    .select({ id: products.id, available: sql<number>`${products.stockOnHand} - ${reservedStock()}`.mapWith(Number) })
    .from(products)
    .where(and(eq(products.businessId, businessId), inArray(products.id, productIds)))
  const available = new Map(stock.map(s => [s.id, s.available]))
  const warnings = order.lines
    .filter(l => available.get(l.product.id)! < 0)
    .map(l => ({
      code: 'stock_negative' as const,
      lineId: l.id,
      product: l.product,
      available: available.get(l.product.id)!,
    }))
  return { ...order, warnings }
}

/** Throws unless the Branch is one of the Customer's (in this business). */
async function assertBranchOfCustomer(tx: Transaction, businessId: string, customerId: string, branchId: string) {
  const [found] = await tx
    .select({ id: branches.id })
    .from(branches)
    .where(and(eq(branches.businessId, businessId), eq(branches.customerId, customerId), eq(branches.id, branchId)))
  if (!found) throw branchNotOfCustomer()
}

/**
 * Locks every Product the Order touches (in id order, via `lockProducts`), so stock warnings
 * are consistent with concurrent Orders. Returns each Product's current Price and Active flag.
 */
async function lockOrderProducts(tx: Transaction, businessId: string, productIds: string[]) {
  await lockProducts(tx, businessId, productIds)
  const rows = await tx
    .select({ id: products.id, name: products.name, price: products.price, isActive: products.isActive })
    .from(products)
    .where(and(eq(products.businessId, businessId), inArray(products.id, [...new Set(productIds)])))
  return new Map(rows.map(r => [r.id, r]))
}

/** Lines to insert, freezing each Product's current Price. Inactive Products are refused. */
function newLines(
  businessId: string,
  orderId: string,
  lines: { line: ValidOrderLine, position: number }[],
  catalog: Awaited<ReturnType<typeof lockOrderProducts>>,
) {
  return lines.map(({ line, position }) => {
    const product = catalog.get(line.productId)!
    if (!product.isActive) throw productInactive(product.name)
    return {
      businessId,
      orderId,
      productId: line.productId,
      position,
      quantity: line.quantity,
      unitPrice: product.price,
      discountPercent: line.discountPercent,
    }
  })
}

/**
 * Takes a Pending Order, from the field or by phone: next Order number, lines frozen at the
 * current Price. Answers with the Order and its negative-stock warnings.
 */
export async function createOrder(db: Database, businessId: string, profileId: string, input: ValidOrderCreate) {
  return db.transaction(async (tx) => {
    await assertCustomer(tx, businessId, input.customerId)
    await assertBranchOfCustomer(tx, businessId, input.customerId, input.branchId)

    const catalog = await lockOrderProducts(tx, businessId, input.lines.map(l => l.productId))
    const number = await nextNumber(tx, businessId, 'order')
    const [created] = await tx
      .insert(orders)
      .values({
        businessId,
        number,
        customerId: input.customerId,
        branchId: input.branchId,
        deliveryDate: input.deliveryDate,
        discountPercent: input.discountPercent,
        notes: input.notes,
        createdBy: profileId,
      })
      .returning({ id: orders.id })
    const orderId = created!.id
    await tx.insert(orderLines).values(newLines(businessId, orderId, input.lines.map((line, position) => ({ line, position })), catalog))
    return withStockWarnings(tx, businessId, orderId)
  })
}

/**
 * Locks the Order row (`FOR UPDATE`) and returns its Customer and status, or 404 when it isn't
 * in this business. Every change to an Order locks it first, then its Products.
 */
export async function lockOrder(tx: Transaction, businessId: string, orderId: string) {
  const [order] = await tx
    .select({ customerId: orders.customerId, status: orders.status })
    .from(orders)
    .where(isOrder(businessId, orderId))
    .for('update')
  if (!order) throw orderNotFound()
  return order
}

/** Throws `order_not_found` unless the Order is in this business, and `order_not_of_customer` unless it's the Customer's. */
export async function assertOrderOfCustomer(db: DbOrTx, businessId: string, customerId: string, orderId: string) {
  const [order] = await db.select({ customerId: orders.customerId }).from(orders).where(isOrder(businessId, orderId))
  if (!order) throw orderNotFound()
  if (order.customerId !== customerId) {
    throw new ApiError(400, 'order_not_of_customer', 'El pedido no es de este cliente')
  }
}

/** Locks the Order row and refuses anything but a Pending Order. */
async function lockPendingOrder(tx: Transaction, businessId: string, orderId: string) {
  const order = await lockOrder(tx, businessId, orderId)
  if (order.status !== 'pending') throw orderNotPending()
  return order
}

/**
 * Edits a Pending Order. `lines`, when given, is the full list: kept lines (by id) keep their
 * frozen price, new lines take the current Price, and lines left out are removed. The Customer
 * never changes.
 */
export async function updateOrder(db: Database, businessId: string, orderId: string, input: ValidOrderUpdate) {
  return db.transaction(async (tx) => {
    const order = await lockPendingOrder(tx, businessId, orderId)
    if (input.branchId) await assertBranchOfCustomer(tx, businessId, order.customerId, input.branchId)

    if (input.lines) {
      const existing = await tx
        .select({ id: orderLines.id, productId: orderLines.productId })
        .from(orderLines)
        .where(and(eq(orderLines.businessId, businessId), eq(orderLines.orderId, orderId)))
      const existingById = new Map(existing.map(l => [l.id, l]))
      for (const line of input.lines) {
        if (!line.id) continue
        const current = existingById.get(line.id)
        if (!current) throw orderLineNotFound()
        if (current.productId !== line.productId) throw orderLineProductChanged()
      }

      // Removed lines release their Reserved stock, so their Products are locked too.
      const catalog = await lockOrderProducts(tx, businessId, [
        ...existing.map(l => l.productId),
        ...input.lines.map(l => l.productId),
      ])

      const keptIds = input.lines.flatMap(l => (l.id ? [l.id] : []))
      await tx.delete(orderLines).where(and(
        eq(orderLines.businessId, businessId),
        eq(orderLines.orderId, orderId),
        keptIds.length > 0 ? notInArray(orderLines.id, keptIds) : undefined,
      ))
      const added: { line: ValidOrderLine, position: number }[] = []
      for (const [position, line] of input.lines.entries()) {
        if (!line.id) {
          added.push({ line, position })
          continue
        }
        await tx
          .update(orderLines)
          .set({ position, quantity: line.quantity, discountPercent: line.discountPercent, updatedAt: sql`now()` })
          .where(and(eq(orderLines.businessId, businessId), eq(orderLines.orderId, orderId), eq(orderLines.id, line.id)))
      }
      if (added.length > 0) await tx.insert(orderLines).values(newLines(businessId, orderId, added, catalog))
    }

    const { branchId, deliveryDate, discountPercent, notes } = input
    await tx
      .update(orders)
      .set({ branchId, deliveryDate, discountPercent, notes, updatedAt: sql`now()` })
      .where(isOrder(businessId, orderId))
    return withStockWarnings(tx, businessId, orderId)
  })
}

/** Cancels a Pending Order. Its Reserved stock is released, since Reserved stock is derived. */
export async function cancelOrder(db: Database, businessId: string, orderId: string) {
  return db.transaction(async (tx) => {
    await lockPendingOrder(tx, businessId, orderId)
    await tx
      .update(orders)
      .set({ status: 'cancelled', cancelledAt: sql`now()`, updatedAt: sql`now()` })
      .where(isOrder(businessId, orderId))
    return getOrder(tx, businessId, orderId)
  })
}

/**
 * Orders for planning the reparto, with their totals: filtered by status, Delivery date, town
 * (the Branch's city, case-insensitive) and Customer. Latest Delivery date first, then by town
 * and number, so one day's Orders come grouped by town.
 */
export async function listOrders(db: Database, businessId: string, query: ValidOrderListQuery) {
  const { status, deliveryDate, town, customerId, limit, offset } = query
  const where = and(
    eq(orders.businessId, businessId),
    status ? eq(orders.status, status) : undefined,
    deliveryDate ? eq(orders.deliveryDate, deliveryDate) : undefined,
    town ? sql`lower(${branches.city}) = lower(${town})` : undefined,
    customerId ? eq(orders.customerId, customerId) : undefined,
  )

  const [rows, [counted]] = await Promise.all([
    selectOrders(db, businessId)
      .where(where)
      .orderBy(desc(orders.deliveryDate), asc(sql`lower(${branches.city})`), asc(orders.number))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(orders)
      .innerJoin(branches, and(eq(branches.businessId, businessId), eq(branches.id, orders.branchId)))
      .where(where),
  ])
  const linesByOrder = new Map<string, LineRow[]>()
  for (const line of await selectLines(db, businessId, rows.map(r => r.id))) {
    linesByOrder.set(line.orderId, [...(linesByOrder.get(line.orderId) ?? []), line])
  }
  return {
    items: rows.map(row => toOrder(row, linesByOrder.get(row.id) ?? [])),
    total: counted!.total,
  }
}
