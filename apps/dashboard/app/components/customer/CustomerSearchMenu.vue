<script setup lang="ts">
import type { CustomerOption } from '~/utils/customers'

/**
 * Picks a Customer by typing part of their name or CUIT. The API does the search, a short pause
 * after typing, so it works with any number of Customers.
 */
const model = defineModel<CustomerOption | undefined>()
withDefaults(defineProps<{ clear?: boolean, autofocus?: boolean }>(), { clear: false, autofocus: false })

const SEARCH_DELAY_MS = 250

const { request } = useApi()
const searchTerm = ref('')
const found = ref<CustomerOption[]>([])
const loading = ref(false)

let searchTimer: ReturnType<typeof setTimeout> | undefined
let latest = 0

async function search(text: string) {
  const call = ++latest
  loading.value = true
  try {
    const { items } = await request(c => c.customers.$get({ query: { q: text.trim() || undefined, limit: '20' } }))
    // A slow answer to an older search never replaces a newer one.
    if (call === latest) found.value = items
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    if (call === latest) loading.value = false
  }
}

watch(searchTerm, (text) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => search(text), SEARCH_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

function onOpen(open: boolean) {
  if (open && !found.value.length) search(searchTerm.value)
}

// The chosen Customer stays among the items, so the input keeps showing its name.
const items = computed(() => {
  const list: (CustomerOption & { description?: string })[] = found.value.map(customer => ({ ...customer, description: customerTowns(customer).join(', ') }))
  if (model.value && !list.some(c => c.id === model.value!.id)) {
    list.unshift({ ...model.value, description: customerTowns(model.value).join(', ') })
  }
  return list
})
</script>

<template>
  <UInputMenu
    v-model="model"
    v-model:search-term="searchTerm"
    :items="items"
    :loading="loading"
    label-key="name"
    by="id"
    ignore-filter
    open-on-focus
    :clear="clear"
    :autofocus="autofocus"
    icon="i-lucide-user"
    placeholder="Buscar cliente por nombre o CUIT"
    autocomplete="off"
    autocorrect="off"
    spellcheck="false"
    @update:open="onOpen"
  >
    <template #empty>
      {{ loading ? 'Buscando…' : 'No encontramos clientes' }}
    </template>
  </UInputMenu>
</template>
