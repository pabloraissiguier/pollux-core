<script setup lang="ts">
import type { Purchase } from '~/utils/purchases'

useSeoMeta({ title: 'Compras' })

const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const { request } = useApi()
const { data: suppliers } = await useSuppliers()

const queryText = (value: unknown) => (typeof value === 'string' ? value : '')

// The filters live in the URL, so coming back from a Purchase keeps them.
const supplierId = ref<string | null>(queryText(route.query.proveedor) || null)
const from = ref(queryText(route.query.desde))
const to = ref(queryText(route.query.hasta))
const page = ref(Number(route.query.pagina) || 1)

watch([supplierId, from, to], () => {
  page.value = 1
})
watch([supplierId, from, to, page], ([proveedor, desde, hasta, pagina]) => {
  router.replace({
    query: {
      proveedor: proveedor || undefined,
      desde: desde || undefined,
      hasta: hasta || undefined,
      pagina: pagina > 1 ? pagina : undefined
    }
  })
})

// The dates are `yyyy-mm-dd` strings, so they compare as text. A backwards range asks nothing.
const backwardsRange = computed(() => !!from.value && !!to.value && from.value > to.value)

const { data: purchases, status } = await useAsyncData(
  'compras',
  () => backwardsRange.value
    ? Promise.resolve({ items: [] as Purchase[], total: 0 })
    : request(c => c.purchases.$get({
        query: {
          supplierId: supplierId.value || undefined,
          from: from.value || undefined,
          to: to.value || undefined,
          limit: String(PAGE_SIZE),
          offset: String((page.value - 1) * PAGE_SIZE)
        }
      })),
  { watch: [supplierId, from, to, page] }
)

// "Todos los proveedores" is a choice of its own: easier to hit on a phone than a clear button.
const supplierItems = computed(() => [{ id: null, name: 'Todos los proveedores' }, ...suppliers.value])
const hasFilters = computed(() => !!supplierId.value || !!from.value || !!to.value)

function purchaseSubtitle(purchase: Purchase) {
  const lines = purchase.lines.length === 1 ? '1 producto' : `${formatUnits(purchase.lines.length)} productos`
  return [formatDate(purchase.purchasedOn), purchase.invoiceNumber && `Factura ${purchase.invoiceNumber}`, lines]
    .filter(Boolean)
    .join(' · ')
}
</script>

<template>
  <UDashboardPanel id="compras">
    <template #header>
      <UDashboardNavbar title="Compras">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/compras/nueva"
            icon="i-lucide-plus"
            label="Nueva compra"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div
          role="search"
          class="grid w-full grid-cols-2 gap-2 py-2 sm:flex sm:items-end"
        >
          <USelectMenu
            v-model="supplierId"
            :items="supplierItems"
            value-key="id"
            label-key="name"
            icon="i-lucide-truck"
            placeholder="Todos los proveedores"
            aria-label="Proveedor"
            :search-input="{ placeholder: 'Buscar proveedor', autofocus: false }"
            class="col-span-2 w-full sm:w-64"
          />
          <UFormField
            label="Desde"
            class="w-full sm:w-44"
          >
            <UInput
              v-model="from"
              type="date"
              :max="to || undefined"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="Hasta"
            class="w-full sm:w-44"
          >
            <UInput
              v-model="to"
              type="date"
              :min="from || undefined"
              class="w-full"
            />
          </UFormField>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UAlert
        v-if="backwardsRange"
        icon="i-lucide-calendar-x"
        color="warning"
        variant="subtle"
        title="La fecha desde no puede ser posterior a la fecha hasta"
      />

      <USkeleton
        v-else-if="status === 'pending' && !purchases"
        class="h-32 w-full"
      />

      <UEmpty
        v-else-if="!purchases?.items.length && hasFilters"
        icon="i-lucide-search-x"
        title="No encontramos compras"
        description="Probá con otro proveedor o con otras fechas."
        variant="naked"
      />

      <UEmpty
        v-else-if="!purchases?.items.length"
        icon="i-lucide-package-plus"
        title="Todavía no hay compras"
        description="Registrá lo que te llega de tus proveedores y el stock sube solo."
        :actions="[{ label: 'Nueva compra', icon: 'i-lucide-plus', to: '/compras/nueva' }]"
        variant="naked"
      />

      <template v-else-if="purchases">
        <UPageList
          as="ul"
          divide
          aria-label="Compras"
        >
          <li
            v-for="purchase in purchases.items"
            :key="purchase.id"
            class="relative"
          >
            <!-- The whole row is the link, so it's an easy target for a thumb. -->
            <ULink
              :to="`/compras/${purchase.id}`"
              class="flex items-center justify-between gap-3 py-3"
            >
              <span class="flex min-w-0 flex-col">
                <span class="truncate font-medium text-highlighted">{{ purchase.supplier.name }}</span>
                <span class="truncate text-sm text-muted tabular-nums">{{ purchaseSubtitle(purchase) }}</span>
              </span>
              <span class="flex shrink-0 items-center gap-2">
                <span class="font-medium text-highlighted tabular-nums">{{ formatMoney(purchase.total) }}</span>
                <UIcon
                  name="i-lucide-chevron-right"
                  class="size-5 text-dimmed"
                />
              </span>
            </ULink>
          </li>
        </UPageList>

        <UPagination
          v-if="purchases.total > PAGE_SIZE"
          v-model:page="page"
          :total="purchases.total"
          :items-per-page="PAGE_SIZE"
          class="self-center"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
