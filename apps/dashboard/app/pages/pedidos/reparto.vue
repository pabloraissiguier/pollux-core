<script setup lang="ts">
import { sumMoney } from '@pollux/contracts'
import { ordersCountLabel } from '~/utils/orders'
import type { Order, OrderListItem } from '~/utils/orders'

useSeoMeta({ title: 'Reparto' })

/** One page holds a whole day: a route's Orders fit well within the API's largest page. */
const PAGE_SIZE = 200

const route = useRoute()
const router = useRouter()
const { request } = useApi()

// The day lives in the URL, so coming back from an Order keeps it. Today by default: reparto day.
const queryText = (value: unknown) => (typeof value === 'string' ? value : '')
const day = ref(queryText(route.query.fecha) || todayInArgentina())
// A valid day or none: a date input is empty while a date is half typed.
const searchedDay = computed(() => (/^\d{4}-\d{2}-\d{2}$/.test(day.value) ? day.value : undefined))

watch(searchedDay, (fecha) => {
  if (fecha) router.replace({ query: { fecha } })
})

const { data: orders, status } = useLazyAsyncData(
  'reparto',
  async () => {
    if (!searchedDay.value) return null
    return request(c => c.orders.$get({ query: { deliveryDate: searchedDay.value, limit: String(PAGE_SIZE) } }))
  },
  { watch: [searchedDay] }
)

/** The day's Orders by town (the API sorts them by town, then number); cancelled ones don't go out. */
const towns = computed(() => {
  const groups = new Map<string, OrderListItem[]>()
  for (const order of orders.value?.items ?? []) {
    if (order.status === 'cancelled') continue
    groups.set(order.branch.city, [...(groups.get(order.branch.city) ?? []), order])
  }
  return [...groups].map(([town, items]) => ({
    town,
    orders: items,
    total: sumMoney(items.map(o => o.totals.total))
  }))
})

const deliveringOrder = ref<OrderListItem | null>(null)
const sheetOpen = ref(false)

function deliver(order: OrderListItem) {
  deliveringOrder.value = order
  sheetOpen.value = true
}

// The delivered Order replaces its row, so the list shows it Delivered without reloading.
function onDelivered(delivered: Order) {
  if (!orders.value) return
  orders.value = { ...orders.value, items: orders.value.items.map(o => (o.id === delivered.id ? delivered : o)) }
}
</script>

<template>
  <UDashboardPanel id="reparto">
    <template #header>
      <UDashboardNavbar title="Reparto">
        <template #leading>
          <UButton
            to="/pedidos"
            icon="i-lucide-arrow-left"
            aria-label="Volver a Pedidos"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UInput
          v-model="day"
          type="date"
          aria-label="Fecha de reparto"
          class="w-full py-2 lg:w-44"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <SkeletonList
        v-if="status === 'pending' && !orders"
        trailing
      />

      <UEmpty
        v-else-if="!towns.length"
        icon="i-lucide-truck"
        title="No hay pedidos para repartir"
        :description="searchedDay ? `No hay pedidos con entrega el ${formatDate(searchedDay)}.` : 'Elegí una fecha.'"
        variant="naked"
      />

      <div
        v-else
        class="flex w-full max-w-2xl flex-col gap-4"
      >
        <UAlert
          v-if="orders && orders.total > orders.items.length"
          :title="`Se muestran los primeros ${orders.items.length} pedidos de ${orders.total}.`"
          icon="i-lucide-info"
          color="warning"
          variant="subtle"
        />

        <UCard
          v-for="(group, index) in towns"
          :key="group.town"
          as="section"
          :aria-labelledby="`reparto-localidad-${index}`"
        >
          <template #header>
            <div class="flex items-baseline justify-between gap-3">
              <h2
                :id="`reparto-localidad-${index}`"
                class="font-semibold text-highlighted"
              >
                {{ group.town }}
              </h2>
              <p class="text-sm text-muted tabular-nums">
                {{ ordersCountLabel(group.orders.length) }} · <span class="font-medium text-highlighted">{{ formatMoney(group.total) }}</span>
              </p>
            </div>
          </template>

          <ul class="divide-y divide-default">
            <li
              v-for="order in group.orders"
              :key="order.id"
              class="flex items-center justify-between gap-3 py-3"
            >
              <ULink
                :to="`/pedidos/${order.id}`"
                class="flex min-w-0 flex-col"
              >
                <span class="truncate font-medium text-highlighted">{{ order.customer.name }}</span>
                <span class="truncate text-sm text-muted tabular-nums">
                  N° {{ order.number }} · {{ order.branch.address }} · {{ formatMoney(order.totals.total) }}
                </span>
              </ULink>
              <UButton
                v-if="order.status === 'pending'"
                label="Entregar"
                icon="i-lucide-truck"
                class="shrink-0"
                @click="deliver(order)"
              />
              <UBadge
                v-else
                :label="orderStatusLabels[order.status]"
                :color="orderStatusColors[order.status]"
                variant="subtle"
                class="shrink-0"
              />
            </li>
          </ul>
        </UCard>
      </div>

      <PaymentSheet
        v-if="deliveringOrder"
        v-model:open="sheetOpen"
        :order="deliveringOrder"
        @delivered="onDelivered"
      />
    </template>
  </UDashboardPanel>
</template>
