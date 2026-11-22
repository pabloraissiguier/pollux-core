<script setup lang="ts">
import { ORDER_STATUSES } from '@pollux/contracts'
import type { OrderStatus } from '@pollux/contracts'
import type { CustomerOption } from '~/utils/customers'

useSeoMeta({ title: 'Pedidos' })

const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const { request } = useApi()

const queryText = (value: unknown) => (typeof value === 'string' ? value : '')
const isStatus = (value: string): value is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(value)

// The filters live in the URL, so coming back from an Order keeps them.
const initialStatus = queryText(route.query.estado)
const status = ref<OrderStatus | undefined>(isStatus(initialStatus) ? initialStatus : undefined)
const deliveryDate = ref(queryText(route.query.fecha))
const town = ref(queryText(route.query.localidad) || undefined)
const customer = ref<CustomerOption | undefined>()
const page = ref(Number(route.query.pagina) || 1)

// A Customer in the URL is shown by name, so it's read once.
const customerIdInUrl = queryText(route.query.cliente)
if (customerIdInUrl) {
  try {
    customer.value = await request(c => c.customers[':id'].$get({ param: { id: customerIdInUrl } }))
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  }
}

const statusItems = ORDER_STATUSES.map(value => ({ value, label: orderStatusLabels[value] }))

// A valid day or none: a date input is empty while a date is half typed.
const searchedDate = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate.value) ? deliveryDate.value : undefined))
const customerId = computed(() => customer.value?.id)

watch([status, searchedDate, town, customerId], () => {
  page.value = 1
})
watch([status, searchedDate, town, customerId, page], ([estado, fecha, localidad, cliente, pagina]) => {
  router.replace({ query: { estado, fecha, localidad, cliente, pagina: pagina > 1 ? pagina : undefined } })
})

const { data: orders, status: listStatus } = await useAsyncData(
  'pedidos',
  () => request(c => c.orders.$get({
    query: {
      status: status.value,
      deliveryDate: searchedDate.value,
      town: town.value,
      customerId: customerId.value,
      limit: String(PAGE_SIZE),
      offset: String((page.value - 1) * PAGE_SIZE)
    }
  })),
  { watch: [status, searchedDate, town, customerId, page] }
)

const { data: towns } = await useAsyncData(
  'localidades',
  async () => (await request(c => c.customers.towns.$get())).items,
  { default: () => [] }
)

const hasFilters = computed(() => !!(status.value || searchedDate.value || town.value || customerId.value))
</script>

<template>
  <UDashboardPanel id="pedidos">
    <template #header>
      <UDashboardNavbar title="Pedidos">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/pedidos/reparto"
            icon="i-lucide-truck"
            label="Reparto"
            color="neutral"
            variant="outline"
          />
          <UButton
            to="/pedidos/nuevo"
            icon="i-lucide-plus"
            label="Nuevo pedido"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div
          role="search"
          class="grid w-full grid-cols-2 gap-2 py-2 lg:flex lg:flex-wrap"
        >
          <CustomerSearchMenu
            v-model="customer"
            aria-label="Cliente"
            clear
            class="col-span-2 lg:w-72"
          />
          <USelectMenu
            v-model="town"
            :items="towns"
            icon="i-lucide-map-pin"
            placeholder="Localidad"
            aria-label="Localidad"
            :search-input="{ placeholder: 'Buscar localidad', autofocus: false }"
            clear
            class="lg:w-56"
          />
          <USelectMenu
            v-model="status"
            :items="statusItems"
            value-key="value"
            :search-input="false"
            placeholder="Estado"
            aria-label="Estado"
            clear
            class="lg:w-44"
          />
          <UInput
            v-model="deliveryDate"
            type="date"
            aria-label="Fecha de entrega"
            class="col-span-2 lg:w-44"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <USkeleton
        v-if="listStatus === 'pending' && !orders"
        class="h-32 w-full"
      />

      <UEmpty
        v-else-if="!orders?.items.length && hasFilters"
        icon="i-lucide-search-x"
        title="No encontramos pedidos"
        description="Probá con otro estado, fecha, localidad o cliente."
        variant="naked"
      />

      <UEmpty
        v-else-if="!orders?.items.length"
        icon="i-lucide-clipboard-list"
        title="Todavía no hay pedidos"
        description="Tomá el primero en ruta o por teléfono con «Nuevo pedido»."
        variant="naked"
      />

      <template v-else-if="orders">
        <UPageList divide>
          <!-- The whole row is the link, so it's an easy target for a thumb. -->
          <ULink
            v-for="order in orders.items"
            :key="order.id"
            :to="`/pedidos/${order.id}`"
            class="relative flex items-center justify-between gap-3 py-3"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-medium text-highlighted">{{ order.customer.name }}</span>
              <span class="truncate text-sm text-muted tabular-nums">
                N° {{ order.number }} · Entrega {{ formatDate(order.deliveryDate) }} · {{ order.branch.city }}
              </span>
            </span>
            <span class="flex shrink-0 flex-col items-end gap-1">
              <span class="font-medium text-highlighted tabular-nums">{{ formatMoney(order.totals.total) }}</span>
              <UBadge
                :label="orderStatusLabels[order.status]"
                :color="orderStatusColors[order.status]"
                variant="subtle"
                size="sm"
              />
            </span>
          </ULink>
        </UPageList>

        <UPagination
          v-if="orders.total > PAGE_SIZE"
          v-model:page="page"
          :total="orders.total"
          :items-per-page="PAGE_SIZE"
          class="self-center"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
