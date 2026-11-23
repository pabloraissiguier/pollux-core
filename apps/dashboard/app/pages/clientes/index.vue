<script setup lang="ts">
import type { Customer } from '~/utils/customers'

useSeoMeta({ title: 'Clientes' })

const { request } = useApi()

// The filters live in the URL, so coming back from a Customer keeps the search.
const { search, searched, filters: { town }, values, page, pageSize, paging, sources } = useListQuery({
  search: 'q',
  filters: { town: textParam('localidad') }
})

const { data: customers, status } = await useAsyncData(
  'clientes',
  () => request(c => c.customers.$get({
    query: { q: searched.value || undefined, town: values.value.town, ...paging.value }
  })),
  { watch: sources }
)

// Towns come from the Customers' Branches. The API has no list of towns yet (#33), so
// this reads the first 200 Customers, which covers a distributor's routes for now.
const { data: towns } = await useAsyncData('clientes-localidades', async () => {
  const { items } = await request(c => c.customers.$get({ query: { limit: '200' } }))
  const names = new Map<string, string>()
  for (const customer of items) {
    for (const city of customerTowns(customer)) names.set(city.toLocaleLowerCase('es-AR'), city)
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'es-AR'))
}, { default: () => [] })

const hasFilters = computed(() => !!searched.value || !!values.value.town)

function customerSubtitle(customer: Customer) {
  return [customerTowns(customer).join(', '), customer.cuit].filter(Boolean).join(' · ')
}
</script>

<template>
  <UDashboardPanel id="clientes">
    <template #header>
      <UDashboardNavbar title="Clientes">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/clientes/nuevo"
            icon="i-lucide-plus"
            label="Nuevo cliente"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div
          role="search"
          class="flex w-full flex-col gap-2 py-2 sm:flex-row"
        >
          <UInput
            v-model="search"
            type="search"
            icon="i-lucide-search"
            placeholder="Buscar por nombre o CUIT"
            aria-label="Buscar por nombre o CUIT"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="search"
            class="w-full sm:max-w-sm"
          />
          <USelectMenu
            v-model="town"
            :items="towns"
            icon="i-lucide-map-pin"
            placeholder="Todas las localidades"
            aria-label="Localidad"
            :search-input="{ placeholder: 'Buscar localidad' }"
            clear
            class="w-full sm:w-56"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <USkeleton
        v-if="status === 'pending' && !customers"
        class="h-32 w-full"
      />

      <UEmpty
        v-else-if="!customers?.items.length && hasFilters"
        icon="i-lucide-search-x"
        title="No encontramos clientes"
        description="Probá con otro nombre, CUIT o localidad."
        variant="naked"
      />

      <UEmpty
        v-else-if="!customers?.items.length"
        icon="i-lucide-users"
        title="Todavía no hay clientes"
        description="Registrá el primero con su nombre y una sucursal."
        variant="naked"
      />

      <template v-else-if="customers">
        <UPageList divide>
          <!-- The whole row is the link, so it's an easy target for a thumb. -->
          <ULink
            v-for="customer in customers.items"
            :key="customer.id"
            :to="`/clientes/${customer.id}`"
            class="relative flex items-center justify-between gap-3 py-3"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-medium text-highlighted">{{ customer.name }}</span>
              <span class="truncate text-sm text-muted">{{ customerSubtitle(customer) }}</span>
            </span>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-5 shrink-0 text-dimmed"
            />
          </ULink>
        </UPageList>

        <UPagination
          v-if="customers.total > pageSize"
          v-model:page="page"
          :total="customers.total"
          :items-per-page="pageSize"
          class="self-center"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
