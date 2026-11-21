import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// Local runs read the shared root .env (Supabase URL and publishable key). Variables already set win.
const rootEnvFile = resolve(import.meta.dirname, '../../.env')
if (existsSync(rootEnvFile)) process.loadEnvFile(rootEnvFile)

// Playwright builds into its own dirs, so an E2E run never clobbers `pnpm dev` or `pnpm build`.
const e2e = !!process.env.POLLUX_E2E

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui'
  ],

  // Everything sits behind sign-in and every byte of data comes from apps/api with a bearer
  // token kept in the browser, so there is nothing to render on the server.
  ssr: false,

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  ui: {
    eslint: {
      rules: {
        'no-unknown-classes': 'error',
        'no-conflicting-classes': 'error',
        'no-palette-colors': 'error'
      }
    }
  },

  // Each value can be overridden at run time with NUXT_PUBLIC_<NAME> (e.g. NUXT_PUBLIC_API_BASE).
  runtimeConfig: {
    public: {
      apiBase: `http://localhost:${process.env.API_PORT || 3001}`,
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
      /**
       * `supabase` (default) or `test`. Test mode skips Supabase: the password typed at sign-in is
       * used as the bearer token, which the API's test verifier reads as a user id. E2E only.
       */
      authMode: 'supabase'
    }
  },

  ...(e2e ? { buildDir: '.nuxt-e2e' } : {}),

  devServer: {
    port: 3010
  },

  compatibilityDate: '2026-06-30',

  nitro: e2e ? { output: { dir: '.output-e2e' } } : {},

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
