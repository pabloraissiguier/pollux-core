/**
 * Idempotent demo seed: one Gio Pack-like business with Categories, Products, an initial
 * stock count, Customers with Branches, Opening balances and Suppliers.
 *
 * - Every row gets a deterministic id derived from a stable key, so re-running never duplicates.
 * - Existing rows are left untouched (on conflict do nothing), so edits made in the app survive.
 * - The initial count and Opening balances are only written when the Product or Customer has none.
 * - If TEST_USER matches an existing Supabase Auth user, it is linked as owner of the business.
 *   The seed never creates users in `auth.users`.
 *
 * Run from the repo root: `pnpm db:seed` (uses DATABASE_URL from the root .env).
 */
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { and, eq, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as s from '../src/schema'
import * as data from './gio-pack.data'

const envFile = resolve(import.meta.dirname, '../../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

const url = process.env.DATABASE_URL
if (!url) throw new Error('DATABASE_URL is not set')

/** Fixed id of the demo business. Everything else is derived from it. */
const BUSINESS_ID = '6a1f0c3e-5b7d-4e21-9c4a-0d2b8e6f7a10'

/** Deterministic UUID (v5-style, SHA-1) from a key, scoped to the demo business. */
function seedId(kind: string, key: string): string {
  const h = createHash('sha1').update(`${BUSINESS_ID}:${kind}:${key}`).digest()
  h[6] = (h[6]! & 0x0f) | 0x50
  h[8] = (h[8]! & 0x3f) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

/** Appends the CUIT check digit to a 10-digit base and formats it as XX-XXXXXXXX-X. */
function cuit(base: string): string {
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = [...base].reduce((acc, d, i) => acc + Number(d) * weights[i]!, 0)
  const r = 11 - (sum % 11)
  const check = r === 11 ? 0 : r === 10 ? 9 : r
  return `${base.slice(0, 2)}-${base.slice(2)}-${check}`
}

const isLocal = /localhost|127\.0\.0\.1/.test(url)
const client = postgres(url, { max: 1, ssl: isLocal ? false : 'require', onnotice: () => {} })
const db = drizzle(client, { schema: s })

const counts = { categories: 0, products: 0, stockCounts: 0, customers: 0, branches: 0, openingBalances: 0, suppliers: 0 }

await db.transaction(async (tx) => {
  await tx.insert(s.businesses).values({ id: BUSINESS_ID, name: data.business.name }).onConflictDoNothing()

  // Owner: link the Supabase Auth user named by TEST_USER, if it exists.
  const email = process.env.TEST_USER
  let ownerId: string | null = null
  if (email) {
    const rows = await tx.execute<{ id: string }>(sql`select id from auth.users where lower(email) = lower(${email}) limit 1`)
    ownerId = rows[0]?.id ?? null
    if (ownerId) {
      await tx.insert(s.profiles).values({ id: ownerId }).onConflictDoNothing()
      await tx.insert(s.businessMembers).values({ businessId: BUSINESS_ID, profileId: ownerId, role: 'owner' }).onConflictDoNothing()
    } else {
      console.warn('TEST_USER does not match any Supabase Auth user; skipping the owner link.')
    }
  }

  const categoryIds = new Map<string, string>()
  for (const name of data.categories) {
    const id = seedId('category', name)
    categoryIds.set(name, id)
    const r = await tx.insert(s.categories).values({ id, businessId: BUSINESS_ID, name }).onConflictDoNothing().returning({ id: s.categories.id })
    counts.categories += r.length
  }

  for (const p of data.products) {
    const id = seedId('product', p.code)
    const inserted = await tx.insert(s.products).values({
      id,
      businessId: BUSINESS_ID,
      code: p.code,
      name: p.name,
      brand: p.brand ?? null,
      categoryId: categoryIds.get(p.category)!,
      price: p.price,
      vatRate: p.vatRate ?? '21.00',
      isActive: !data.inactiveProductCodes.includes(p.code),
    }).onConflictDoNothing().returning({ id: s.products.id })

    if (inserted.length) {
      counts.products++
      await tx.insert(s.productPriceChanges).values({ businessId: BUSINESS_ID, productId: id, oldPrice: null, newPrice: p.price, changedBy: ownerId })
    }

    // Initial count only if the Product has no Stock movements yet.
    if (p.stock > 0) {
      const existing = await tx.select({ id: s.stockMovements.id }).from(s.stockMovements)
        .where(and(eq(s.stockMovements.businessId, BUSINESS_ID), eq(s.stockMovements.productId, id))).limit(1)
      if (!existing.length) {
        await tx.insert(s.stockMovements).values({
          businessId: BUSINESS_ID,
          productId: id,
          type: 'adjustment',
          adjustmentReason: 'initial_count',
          quantity: p.stock,
          notes: 'Conteo inicial (seed)',
          createdBy: ownerId,
        })
        await tx.update(s.products)
          .set({ stockOnHand: sql`${s.products.stockOnHand} + ${p.stock}`, updatedAt: sql`now()` })
          .where(and(eq(s.products.businessId, BUSINESS_ID), eq(s.products.id, id)))
        counts.stockCounts++
      }
    }
  }

  for (const c of data.customers) {
    const customerId = seedId('customer', c.key)
    const r = await tx.insert(s.customers).values({
      id: customerId,
      businessId: BUSINESS_ID,
      name: c.name,
      legalName: c.legalName ?? null,
      cuit: c.cuitBase ? cuit(c.cuitBase) : null,
      vatCondition: c.vatCondition ?? null,
      phone: c.phone ?? null,
    }).onConflictDoNothing().returning({ id: s.customers.id })
    counts.customers += r.length

    for (const [i, b] of c.branches.entries()) {
      const br = await tx.insert(s.branches).values({
        id: seedId('branch', `${c.key}:${i}`),
        businessId: BUSINESS_ID,
        customerId,
        name: b.name ?? null,
        address: b.address,
        city: b.city,
      }).onConflictDoNothing().returning({ id: s.branches.id })
      counts.branches += br.length
    }

    if (c.openingBalance) {
      const existing = await tx.select({ id: s.balanceEntries.id }).from(s.balanceEntries).where(and(
        eq(s.balanceEntries.businessId, BUSINESS_ID),
        eq(s.balanceEntries.customerId, customerId),
        eq(s.balanceEntries.type, 'opening_balance'),
      )).limit(1)
      if (!existing.length) {
        await tx.insert(s.balanceEntries).values({
          businessId: BUSINESS_ID,
          customerId,
          type: 'opening_balance',
          amount: c.openingBalance.amount,
          entryDate: c.openingBalance.date,
          reason: 'Saldo traído de la planilla de Excel (seed)',
          createdBy: ownerId,
        })
        counts.openingBalances++
      }
    }
  }

  for (const sup of data.suppliers) {
    const r = await tx.insert(s.suppliers).values({
      id: seedId('supplier', sup.key),
      businessId: BUSINESS_ID,
      name: sup.name,
      cuit: cuit(sup.cuitBase),
      phone: sup.phone,
    }).onConflictDoNothing().returning({ id: s.suppliers.id })
    counts.suppliers += r.length
  }

  console.log(`Business ${data.business.name} (${BUSINESS_ID})${ownerId ? ', owner linked' : ''}`)
})

console.log('Inserted:', counts)
await client.end()
