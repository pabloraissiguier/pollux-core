import { createRemoteJWKSet, errors, jwtVerify } from 'jose'
import { z } from 'zod'

/**
 * Turns a bearer token into the signed-in user's id (`auth.users.id`), or null when the token
 * isn't valid. `kind` lets the app factory refuse the test verifier in production.
 */
export interface AuthVerifier {
  (token: string): Promise<string | null>
  readonly kind: 'supabase' | 'test'
}

/** Token errors mean "not signed in". Anything else (e.g. the JWKS can't be fetched) is a real failure. */
const INVALID_TOKEN_ERRORS = [
  errors.JWTExpired,
  errors.JWTClaimValidationFailed,
  errors.JWTInvalid,
  errors.JWSInvalid,
  errors.JWSSignatureVerificationFailed,
  errors.JWKSNoMatchingKey,
  errors.JOSEAlgNotAllowed,
  errors.JOSENotSupported,
]

/**
 * Verifies Supabase Auth access tokens against the project's JWKS (asymmetric signing keys),
 * so the API never holds a shared JWT secret. The key set is fetched once and cached by `jose`.
 */
export function createSupabaseVerifier(supabaseUrl: string): AuthVerifier {
  const issuer = new URL('/auth/v1', supabaseUrl).toString()
  const jwks = createRemoteJWKSet(new URL('/auth/v1/.well-known/jwks.json', supabaseUrl))

  return Object.assign(async (token: string) => {
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' })
      return typeof payload.sub === 'string' ? payload.sub : null
    }
    catch (error) {
      if (INVALID_TOKEN_ERRORS.some(E => error instanceof E)) return null
      throw error
    }
  }, { kind: 'supabase' as const })
}

/**
 * For tests and local tryouts only: the bearer token is the user's id itself.
 * The app factory refuses it when NODE_ENV is production.
 */
export function createTestVerifier(): AuthVerifier {
  return Object.assign(async (token: string) => {
    const parsed = z.uuid().safeParse(token)
    return parsed.success ? parsed.data : null
  }, { kind: 'test' as const })
}
