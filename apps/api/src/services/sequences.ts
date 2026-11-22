import { businessSequences } from '@pollux/db/schema'
import { sql } from 'drizzle-orm'
import type { Transaction } from '../db'

/**
 * Takes the business's next number of a kind (Order, Delivery note). The upsert means a business
 * needs no rows created ahead of time, and its row lock makes concurrent callers wait their turn.
 * Call it inside the transaction that uses the number: a rollback gives the number back.
 */
export async function nextNumber(tx: Transaction, businessId: string, kind: 'order' | 'delivery_note') {
  const [row] = await tx
    .insert(businessSequences)
    .values({ businessId, kind, lastValue: 1 })
    .onConflictDoUpdate({
      target: [businessSequences.businessId, businessSequences.kind],
      set: { lastValue: sql`${businessSequences.lastValue} + 1`, updatedAt: sql`now()` },
    })
    .returning({ value: businessSequences.lastValue })
  return row!.value
}
