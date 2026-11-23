import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import { todayInCordoba, type CustomerCreateInput } from '@pollux/contracts'
import postgres from 'postgres'
import { E2E_API_PORT, e2eDatabaseUrl } from './env'

interface Fixtures {
  /** Creates a signed-up user who owns the named businesses, and returns the user's id. */
  createOwner: (...businessNames: string[]) => Promise<string>
  /** Takes the user out of the named business, as if the owner had removed them. */
  removeMembership: (userId: string, businessName: string) => Promise<void>
  /**
   * Signs in through `/login` in test mode, where the password is the token (the user's id).
   * `from: 'here'` fills the sign-in form the page is already on.
   */
  signIn: (userId: string, options?: { from?: 'start' | 'here' }) => Promise<void>
  /** On a phone the sidebar is a drawer: opens it. On a wide screen it's always there. */
  openSidebar: () => Promise<void>
  /** Creates a Customer through the API in the user's first business, and returns its id. */
  createCustomer: (userId: string, input: CustomerCreateInput) => Promise<string>
  /**
   * Calls the API as the user, in their first business, and returns the JSON body. For data a
   * test only needs as a starting point (Products with stock, Orders), not for the flow under test.
   */
  callApi: <T = { id: string }>(userId: string, method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown) => Promise<T>
}

async function callApiAs<T>(userId: string, method: string, path: string, body?: unknown): Promise<T> {
  const [business] = await sql<{ id: string }[]>`
    select m.business_id as id from app.business_members m where m.profile_id = ${userId} limit 1`
  const res = await fetch(`http://localhost:${E2E_API_PORT}${path}`, {
    method,
    headers: { 'Authorization': `Bearer ${userId}`, 'X-Business-Id': business!.id, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  if (!res.ok) throw new Error(`${method} ${path} failed: ${res.status} ${await res.text()}`)
  return await res.json() as T
}

const sql = postgres(e2eDatabaseUrl(), { max: 2, onnotice: () => {} })

/**
 * Setup data with no endpoint (users, businesses, memberships) goes straight into the E2E
 * database, as in the API suite's fixtures. Everything else goes through the app. Each test makes
 * its own user and businesses, so tests run in parallel without cleaning up. Data a test only
 * needs as a starting point (e.g. Customers) may go through the API directly.
 */
export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  createOwner: async ({}, use) => {
    await use(async (...businessNames) => {
      const userId = randomUUID()
      await sql`insert into auth.users (id) values (${userId})`
      await sql`insert into public.profiles (id) values (${userId})`
      for (const name of businessNames) {
        const [business] = await sql<{ id: string }[]>`insert into app.businesses (name) values (${name}) returning id`
        await sql`insert into app.business_members (business_id, profile_id, role) values (${business!.id}, ${userId}, 'owner')`
      }
      return userId
    })
  },
  // eslint-disable-next-line no-empty-pattern
  removeMembership: async ({}, use) => {
    await use(async (userId, businessName) => {
      await sql`
        delete from app.business_members m using app.businesses b
        where b.id = m.business_id and m.profile_id = ${userId} and b.name = ${businessName}`
    })
  },
  signIn: async ({ page }, use) => {
    await use(async (userId, { from = 'start' } = {}) => {
      if (from === 'start') await page.goto('/login')
      await page.getByRole('textbox', { name: 'Email' }).fill('duenio@prueba.local')
      await page.getByRole('textbox', { name: 'Contraseña' }).fill(userId)
      await page.getByRole('button', { name: 'Ingresar' }).click()
    })
  },
  // eslint-disable-next-line no-empty-pattern
  createCustomer: async ({}, use) => {
    await use(async (userId, input) => (await callApiAs<{ id: string }>(userId, 'POST', '/customers', input)).id)
  },
  // eslint-disable-next-line no-empty-pattern
  callApi: async ({}, use) => {
    await use(callApiAs)
  },
  openSidebar: async ({ page, isMobile }, use) => {
    await use(async () => {
      if (isMobile) await page.getByRole('button', { name: 'Abrir barra lateral' }).click()
    })
  }
})

export { expect }

/**
 * A day in Argentina as `yyyy-mm-dd`, `offset` calendar days from today. Today comes from
 * `todayInCordoba` in `@pollux/contracts`, the rule the past-day validators use, so a test's "today"
 * and "tomorrow" are the days those validators accept and reject.
 */
export function dayInArgentina(offset = 0): string {
  const [y, m, d] = todayInCordoba().split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! + offset)).toISOString().slice(0, 10)
}
