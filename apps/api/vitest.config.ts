import { defineConfig } from 'vitest/config'

// Tests must never reach Supabase: drop its connection strings from the test process.
// The suite only reads TEST_DATABASE_URL (see test/test-db.ts).
delete process.env.DATABASE_URL

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    include: ['test/**/*.test.ts'],
    env: { NODE_ENV: 'test' },
  },
})
