import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/** Where test mode keeps its token. Supabase keeps its own session in localStorage. */
const TEST_TOKEN_KEY = 'pollux.test-token'

let supabase: SupabaseClient | null = null

function supabaseClient({ supabaseUrl, supabasePublishableKey }: { supabaseUrl: string, supabasePublishableKey: string }): SupabaseClient {
  if (!supabase) {
    supabase = createClient(supabaseUrl, supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    })
  }
  return supabase
}

function readTestToken(): string | null {
  try {
    return localStorage.getItem(TEST_TOKEN_KEY)
  } catch {
    return null
  }
}

function writeTestToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TEST_TOKEN_KEY, token)
    else localStorage.removeItem(TEST_TOKEN_KEY)
  } catch {
    // Storage blocked (private mode): the session just won't outlive the tab.
  }
}

export class SignInError extends Error {}

/**
 * The signed-in session. Supabase Auth (email and password) is the only thing the dashboard
 * talks to besides apps/api. In test mode (`NUXT_PUBLIC_AUTH_MODE=test`, E2E only) Supabase is
 * skipped and the password is used as the bearer token: the API's test verifier reads it as a
 * user id, and the API refuses that verifier in production.
 */
export function useAuth() {
  const config = useRuntimeConfig().public
  const testMode = config.authMode === 'test'
  const signedIn = useState('auth-signed-in', () => false)

  /** Restores the stored session. Runs once, in the auth plugin, before the first navigation. */
  async function init() {
    if (testMode) {
      signedIn.value = !!readTestToken()
      return
    }
    const client = supabaseClient(config)
    const { data } = await client.auth.getSession()
    signedIn.value = !!data.session
    client.auth.onAuthStateChange((_event, session) => {
      signedIn.value = !!session
    })
  }

  async function signIn(email: string, password: string) {
    if (testMode) {
      writeTestToken(password)
      signedIn.value = true
      return
    }
    const { error } = await supabaseClient(config).auth.signInWithPassword({ email, password })
    if (error) {
      throw new SignInError(error.code === 'invalid_credentials'
        ? 'El email o la contraseña no son correctos'
        : 'No pudimos iniciar sesión. Probá de nuevo.')
    }
    signedIn.value = true
  }

  async function signOut() {
    if (testMode) writeTestToken(null)
    else await supabaseClient(config).auth.signOut({ scope: 'local' })
    signedIn.value = false
  }

  /** A current access token (Supabase refreshes it when it's about to expire), or null. */
  async function accessToken(): Promise<string | null> {
    if (testMode) return readTestToken()
    const { data } = await supabaseClient(config).auth.getSession()
    return data.session?.access_token ?? null
  }

  return { testMode, signedIn: readonly(signedIn), init, signIn, signOut, accessToken }
}
