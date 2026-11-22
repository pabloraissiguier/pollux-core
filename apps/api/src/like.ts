import type { AnyColumn, SQL } from 'drizzle-orm'
import { sql } from 'drizzle-orm'

/** Escapes `%`, `_` and `\` so user text matches literally inside a LIKE pattern. */
export function likeContains(text: string) {
  return `%${text.replace(/[\\%_]/g, c => `\\${c}`)}%`
}

/**
 * Matches a stored CUIT (`XX-XXXXXXXX-X`) against search text typed with or without dashes,
 * by comparing both sides without them. Undefined when the text has nothing but dashes.
 */
export function cuitContains(column: AnyColumn, text: string): SQL | undefined {
  const digits = text.replace(/-/g, '')
  return digits ? sql`replace(${column}, '-', '') ilike ${likeContains(digits)}` : undefined
}
