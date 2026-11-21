import { randomUUID } from 'node:crypto'
import { test as base, expect } from '@playwright/test'
import postgres from 'postgres'
import { e2eDatabaseUrl } from './env'

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
}

const sql = postgres(e2eDatabaseUrl(), { max: 2, onnotice: () => {} })

/**
 * Setup data with no endpoint (users, businesses, memberships) goes straight into the E2E
 * database, as in the API suite's fixtures. Everything else goes through the app. Each test makes
 * its own user and businesses, so tests run in parallel without cleaning up.
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
  openSidebar: async ({ page, isMobile }, use) => {
    await use(async () => {
      if (isMobile) await page.getByRole('button', { name: 'Abrir barra lateral' }).click()
    })
  }
})

export { expect }
