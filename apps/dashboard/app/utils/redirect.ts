import type { RouteLocationRaw } from 'vue-router'

/**
 * The return path after sign-in, from the `redirect` query. Only same-app paths are allowed
 * (`/clientes?q=x`), never another origin (`//evil.com`, `/\evil.com`) or `/login` itself.
 */
export function safeRedirect(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) {
    return '/'
  }
  return value.startsWith('/login') ? '/' : value
}

/** `path`, carrying `returnTo` as its `redirect` query unless it's just Inicio. */
export function withReturnPath(path: string, returnTo: string): RouteLocationRaw {
  const redirect = safeRedirect(returnTo)
  return { path, query: redirect === '/' ? {} : { redirect } }
}
