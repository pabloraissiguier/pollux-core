<script setup lang="ts">
import { statementAmountText, statementEntryLabel } from '~/utils/balance'
import type { Statement } from '~/utils/balance'

/**
 * Resumen de cuenta: the Customer's Balance entries in date order (debe/haber), each with the
 * Balance right after it, filterable by a date range kept in the URL (`?desde=`, `?hasta=`).
 */
const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const { request } = useApi()
const customerId = String(route.params.clienteId)

const queryText = (value: unknown) => (typeof value === 'string' ? value : '')

const from = ref(queryText(route.query.desde))
const to = ref(queryText(route.query.hasta))
const page = ref(Number(route.query.pagina) || 1)

// A valid day or none: a date input is empty while a date is half typed.
const day = (value: string) => (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined)
const fromDay = computed(() => day(from.value))
const toDay = computed(() => day(to.value))

watch([fromDay, toDay], () => {
  page.value = 1
})
watch([fromDay, toDay, page], ([desde, hasta, pagina]) => {
  router.replace({ query: { desde, hasta, pagina: pagina > 1 ? pagina : undefined } })
})

// The dates are `yyyy-mm-dd` strings, so they compare as text. A backwards range asks nothing.
const backwardsRange = computed(() => !!fromDay.value && !!toDay.value && fromDay.value > toDay.value)

const { data: current, refresh: refreshCurrent } = await useAsyncData(
  `cliente-${customerId}-saldo`,
  () => request(c => c.customers[':id'].balance.$get({ param: { id: customerId } }))
)

useSeoMeta({ title: () => (current.value ? `Resumen de cuenta · ${current.value.customer.name}` : 'Resumen de cuenta') })

const { data: statement, status, refresh: refreshStatement } = await useAsyncData(
  `resumen-${customerId}`,
  () => backwardsRange.value
    ? Promise.resolve<Statement>({ items: [], total: 0 })
    : request(c => c.customers[':id'].statement.$get({
        param: { id: customerId },
        query: {
          from: fromDay.value,
          to: toDay.value,
          limit: String(PAGE_SIZE),
          offset: String((page.value - 1) * PAGE_SIZE)
        }
      })),
  { watch: [fromDay, toDay, page] }
)

const paying = ref(false)

function onPaymentRecorded() {
  refreshCurrent()
  refreshStatement()
}

const hasRange = computed(() => !!fromDay.value || !!toDay.value)
</script>

<template>
  <UDashboardPanel id="resumen-de-cuenta">
    <template #header>
      <UDashboardNavbar :title="current?.customer.name ?? 'Resumen de cuenta'">
        <template #leading>
          <UButton
            :to="`/clientes/${customerId}`"
            icon="i-lucide-arrow-left"
            aria-label="Volver al cliente"
            color="neutral"
            variant="ghost"
          />
        </template>

        <template
          v-if="current"
          #right
        >
          <UButton
            label="Registrar pago"
            icon="i-lucide-banknote"
            @click="paying = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div class="grid w-full grid-cols-2 gap-2 py-2 sm:flex">
          <UFormField
            label="Desde"
            class="w-full sm:w-44"
          >
            <UInput
              v-model="from"
              type="date"
              :max="toDay"
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
              :min="fromDay"
              class="w-full"
            />
          </UFormField>
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex w-full max-w-2xl flex-col gap-4">
        <UCard v-if="current">
          <CustomerBalanceFigure :balance="current.balance" />
        </UCard>

        <UAlert
          v-if="backwardsRange"
          icon="i-lucide-calendar-x"
          color="warning"
          variant="subtle"
          title="La fecha desde no puede ser posterior a la fecha hasta"
        />

        <USkeleton
          v-else-if="status === 'pending' && !statement"
          class="h-32 w-full"
        />

        <UEmpty
          v-else-if="!statement?.items.length && hasRange"
          icon="i-lucide-calendar-search"
          title="No hay movimientos en estas fechas"
          description="Probá con otro rango de fechas."
          variant="naked"
        />

        <UEmpty
          v-else-if="!statement?.items.length"
          icon="i-lucide-receipt-text"
          title="Todavía no hay movimientos"
          description="Las entregas, los pagos y los ajustes de este cliente van a aparecer acá."
          variant="naked"
        />

        <template v-else-if="statement">
          <UCard>
            <ul
              aria-label="Movimientos de cuenta"
              class="divide-y divide-default"
            >
              <li
                v-for="entry in statement.items"
                :key="entry.id"
                class="flex items-start justify-between gap-3 py-3"
              >
                <span class="flex min-w-0 flex-col">
                  <ULink
                    v-if="entry.order"
                    :to="`/pedidos/${entry.order.id}`"
                    class="font-medium text-highlighted"
                  >
                    {{ statementEntryLabel(entry) }}
                  </ULink>
                  <span
                    v-else
                    class="font-medium text-highlighted"
                  >{{ statementEntryLabel(entry) }}</span>
                  <span class="text-sm text-muted tabular-nums">{{ formatDate(entry.entryDate) }}</span>
                </span>
                <span class="flex shrink-0 flex-col items-end tabular-nums">
                  <span class="text-highlighted">{{ statementAmountText(entry.amount) }}</span>
                  <span class="text-sm text-muted">Saldo {{ formatMoney(entry.balance) }}</span>
                </span>
              </li>
            </ul>
          </UCard>

          <UPagination
            v-if="statement.total > PAGE_SIZE"
            v-model:page="page"
            :total="statement.total"
            :items-per-page="PAGE_SIZE"
            class="self-center"
          />
        </template>
      </div>

      <PaymentSheet
        v-if="current"
        v-model:open="paying"
        :customer="current.customer"
        @recorded="onPaymentRecorded"
      />
    </template>
  </UDashboardPanel>
</template>
