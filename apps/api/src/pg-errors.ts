/**
 * Whether `err` is Postgres refusing a write on the named unique constraint. Drizzle wraps the
 * driver's error in a `DrizzleQueryError`, so the Postgres one is its `cause`.
 */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  const pg = (err instanceof Error && err.cause ? err.cause : err) as { code?: string, constraint_name?: string } | null
  return pg?.code === '23505' && pg.constraint_name === constraint
}
