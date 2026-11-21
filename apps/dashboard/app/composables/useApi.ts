import type { FormError } from '@nuxt/ui'
import type { AppType } from 'api/src/app'
import { hc, type ClientResponse } from 'hono/client'
import type { RouteLocationRaw } from 'vue-router'

/** An API error after it has been shown to the user. Callers only need it to stop their flow. */
export class ApiRequestError extends Error {
  /** Where the user has to go to recover (sign-in, the business picker), if anywhere. */
  redirectTo?: RouteLocationRaw

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message)
  }
}

/** The bit of a `UForm` instance the API client needs to show field errors. */
export interface FormErrorTarget {
  setErrors: (errors: FormError[]) => void
}

export interface ApiRequestOptions {
  /** On a 400 `validation_error`, show the messages on this form's fields instead of a toast. */
  form?: FormErrorTarget | null
  /**
   * Go to `error.redirectTo` on a 401 or 403 (default). Route middleware passes false and
   * returns `navigateTo(error.redirectTo)` itself, since it can't start a second navigation.
   */
  navigate?: boolean
}

type Client = ReturnType<typeof hc<AppType>>
/** The body of the successful responses of an endpoint. */
type SuccessBody<R> = R extends ClientResponse<infer T, infer S, 'json'> ? (S extends 200 | 201 ? T : never) : never

const NETWORK_ERROR = 'No pudimos conectar con el servidor. Revisá tu conexión y probá de nuevo.'
const UNEXPECTED_ERROR = 'Ocurrió un error inesperado. Probá de nuevo.'

async function readError(res: Response): Promise<ApiRequestError> {
  try {
    const { error } = await res.json() as { error: { code: string, message: string, details?: unknown } }
    return new ApiRequestError(res.status, error.code, error.message, error.details)
  } catch {
    return new ApiRequestError(res.status, 'unknown', UNEXPECTED_ERROR)
  }
}

/**
 * The only way the dashboard reaches its data: the typed Hono client of apps/api, with the
 * session's bearer token and the active business (`X-Business-Id`) on every request.
 *
 * `request(c => c.me.$get())` returns the parsed body, or shows the error and throws
 * `ApiRequestError`:
 * - 401: the session is gone. Sign out and go to `/login`, coming back here afterwards.
 * - 403, or 400 `business_not_selected`: go to the business picker (`/negocio`).
 * - 400 `validation_error` with `options.form`: the messages go on the form's fields.
 * - anything else: a toast with the API's Spanish message.
 */
export function useApi() {
  const { apiBase } = useRuntimeConfig().public
  const auth = useAuth()
  const { activeBusinessId, forgetBusiness, reset } = useActiveBusiness()
  const toast = useToast()
  // Captured now: the handlers below run after awaits, outside the Nuxt context.
  const route = useRoute()
  const router = useRouter()

  const client = hc<AppType>(apiBase, {
    headers: async (): Promise<Record<string, string>> => {
      const headers: Record<string, string> = {}
      const token = await auth.accessToken()
      if (token) headers.Authorization = `Bearer ${token}`
      if (activeBusinessId.value) headers['X-Business-Id'] = activeBusinessId.value
      return headers
    }
  })

  async function handle(error: ApiRequestError, options: ApiRequestOptions) {
    if (error.status === 401) {
      await auth.signOut()
      reset()
      clearNuxtData()
      const redirect = safeRedirect(route.fullPath)
      error.redirectTo = { path: '/login', query: redirect === '/' ? {} : { redirect } }
      toast.add({ title: error.message, color: 'warning', icon: 'i-lucide-log-in' })
    } else if (error.status === 403 || error.code === 'business_not_selected') {
      if (error.code === 'not_a_member') forgetBusiness()
      reset()
      error.redirectTo = '/negocio'
      toast.add({ title: error.message, color: 'warning', icon: 'i-lucide-building-2' })
    } else if (error.code === 'validation_error' && options.form && error.details) {
      const details = error.details as Record<string, string[]>
      options.form.setErrors(Object.entries(details).map(([name, messages]) => ({ name, message: messages[0] ?? '' })))
    } else {
      toast.add({ title: error.message, color: 'error', icon: 'i-lucide-circle-alert' })
    }
    if (error.redirectTo && options.navigate !== false) await router.replace(error.redirectTo)
  }

  async function request<R extends ClientResponse<unknown, number, 'json'>>(
    call: (client: Client) => Promise<R>,
    options: ApiRequestOptions = {}
  ): Promise<SuccessBody<R>> {
    let res: R
    try {
      res = await call(client)
    } catch {
      toast.add({ title: NETWORK_ERROR, color: 'error', icon: 'i-lucide-wifi-off' })
      throw new ApiRequestError(0, 'network_error', NETWORK_ERROR)
    }
    if (res.ok) return await res.json() as SuccessBody<R>

    const error = await readError(res as unknown as Response)
    await handle(error, options)
    throw error
  }

  return { client, request }
}
