/**
 * Prints a Supabase access token for TEST_USER / TEST_PASS (root .env), for trying the API by
 * hand: `export TOKEN=$(pnpm --silent dev:token)`. Credentials never go on the command line.
 */
import '../src/env'

const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_USER, TEST_PASS } = process.env
if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !TEST_USER || !TEST_PASS) {
  throw new Error('Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, TEST_USER and TEST_PASS in the root .env')
}

const res = await fetch(new URL('/auth/v1/token?grant_type=password', SUPABASE_URL), {
  method: 'POST',
  headers: { 'apikey': SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: TEST_USER, password: TEST_PASS }),
})
const body = await res.json() as { access_token?: string, error_description?: string, msg?: string }
if (!res.ok || !body.access_token) {
  throw new Error(`Supabase sign-in failed (${res.status}): ${body.error_description ?? body.msg ?? 'unknown error'}`)
}
process.stdout.write(body.access_token)
