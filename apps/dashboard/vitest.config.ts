import { defineConfig } from 'vitest/config'

// Far west of UTC, so a date that drifts through a UTC `Date` shows up as the wrong day.
process.env.TZ = 'Pacific/Honolulu'

/** Unit tests for pure modules (formatting). Screens and flows are covered by Playwright in e2e/. */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts']
  }
})
