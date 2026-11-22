import type { Ref } from 'vue'

/** A list filter kept in the URL: how it reads from `route.query` and what it writes back. */
export interface UrlParam<T, W extends string = string> {
  /** The Spanish name in the URL, e.g. `localidad`. */
  key: string
  read: (raw: unknown) => T
  /** The value for the URL and the request, or undefined to leave it out. */
  write: (value: T) => W | undefined
}

type ParamValue<P> = P extends UrlParam<infer T, string> ? T : never
type ParamWritten<P> = P extends UrlParam<unknown, infer W> ? W : never
type Params = Record<string, UrlParam<any, string>> // eslint-disable-line @typescript-eslint/no-explicit-any

const SEARCH_DELAY_MS = 300
const PAGE_SIZE = 50
const DAY = /^\d{4}-\d{2}-\d{2}$/

const queryText = (raw: unknown) => (typeof raw === 'string' ? raw : '')

/** Free text, such as an id or a town. Missing reads as `empty`: a picker may need `null`. */
export function textParam(key: string, empty: null | undefined = undefined): UrlParam<string | null | undefined> {
  return { key, read: raw => queryText(raw) || empty, write: value => value || undefined }
}

/** An on/off switch, `1` in the URL while on. */
export function flagParam(key: string): UrlParam<boolean> {
  return { key, read: raw => raw === '1', write: value => (value ? '1' : undefined) }
}

/** A date input's text. It counts only as a whole `yyyy-mm-dd` day, never half typed. */
export function dayParam(key: string): UrlParam<string> {
  return { key, read: queryText, write: value => (DAY.test(value) ? value : undefined) }
}

/** One of a fixed set of values; anything else in the URL reads as none. */
export function enumParam<T extends string>(key: string, values: readonly T[]): UrlParam<T | undefined, T> {
  return {
    key,
    read: raw => (values as readonly unknown[]).includes(raw) ? raw as T : undefined,
    write: value => value
  }
}

/**
 * A paged list whose search, filters and page live in the URL, so a reload or coming back from
 * a row finds the list as it was left.
 *
 * - `search` names the URL key of a free-text search (`q`). The search waits for a pause in
 *   typing (`searched` is the trimmed text the API should get).
 * - `filters` are the other filters, each a `UrlParam` (`textParam`, `flagParam`, …). `filters`
 *   in the result holds a ref per filter for `v-model`, and `values` what each one sends.
 * - Changing the search or a filter goes back to the first page.
 * - `paging` is the `limit`/`offset` of the current page, and `sources` what `useAsyncData`
 *   should watch to fetch again.
 *
 * The URL query is written in this order: the search, the filters as declared, then `pagina`.
 */
export function useListQuery<F extends Params = Record<never, never>>(options: {
  search?: string
  filters?: F
} = {}) {
  const route = useRoute()
  const router = useRouter()
  const pageSize = PAGE_SIZE
  const params = Object.entries(options.filters ?? {}) as [keyof F & string, UrlParam<unknown>][]

  const filters = Object.fromEntries(params.map(([name, param]) => [name, ref(param.read(route.query[param.key]))])) as
    { [K in keyof F]: Ref<ParamValue<F[K]>> }
  const values = computed(() => Object.fromEntries(params.map(([name, param]) => [name, param.write(filters[name].value)])) as
    { [K in keyof F]: ParamWritten<F[K]> | undefined })
  // Compared as text: a filter edit that sends the same value (a date half typed) changes nothing.
  const valuesKey = computed(() => JSON.stringify(values.value))

  const search = ref(options.search ? queryText(route.query[options.search]) : '')
  const searched = ref(search.value)
  const page = ref(Number(route.query.pagina) || 1)

  let searchTimer: ReturnType<typeof setTimeout> | undefined
  watch(search, (value) => {
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => {
      searched.value = value.trim()
      page.value = 1
    }, SEARCH_DELAY_MS)
  })
  onBeforeUnmount(() => clearTimeout(searchTimer))

  // Registered before the URL watcher, so the URL gets the page already reset.
  watch(valuesKey, () => {
    page.value = 1
  })

  watch([searched, valuesKey, page], () => {
    const query: Record<string, string | undefined> = {}
    if (options.search) query[options.search] = searched.value || undefined
    for (const [name, param] of params) query[param.key] = values.value[name]
    query.pagina = page.value > 1 ? String(page.value) : undefined
    router.replace({ query })
  })

  const paging = computed(() => ({ limit: String(pageSize), offset: String((page.value - 1) * pageSize) }))

  return {
    search,
    searched: readonly(searched),
    filters,
    values,
    page,
    pageSize,
    paging,
    sources: [searched, valuesKey, page]
  }
}
