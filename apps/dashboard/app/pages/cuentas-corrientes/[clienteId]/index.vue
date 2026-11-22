<script setup lang="ts">
import { statementAmountText, statementEntryLabel } from '~/utils/balance'
import type { Statement } from '~/utils/balance'

/**
 * Resumen de cuenta: the Customer's Balance entries in date order (debe/haber), each with the
 * Balance right after it, filterable by a date range kept in the URL (`?desde=`, `?hasta=`).
 */
const route = useRoute()
const { request } = useApi()
const customerId = String(route.params.clienteId)

const { filters: { from, to }, values, page, pageSize, paging, sources } = useListQuery({
  filters: { from: dayParam('desde'), to: dayParam('hasta') }
})
// A valid day or none: a date input is empty while a date is half typed.
const fromDay = computed(() => values.value.from)
const toDay = computed(() => values.value.to)

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
          ...paging.value
        }
      })),
  { watch: sources }
)

const paying = ref(false)

function onBalanceChanged() {
  refreshCurrent()
  refreshStatement()
}

const { items: entryActions, kind: entryKind, open: entryOpen, saved: onEntrySaved } = await useBalanceEntryActions(customerId, onBalanceChanged)

// The print view prints the range on screen.
const moreActions = computed(() => [
  ...entryActions.value,
  { label: 'Imprimir resumen', icon: 'i-lucide-printer', to: { path: `/cuentas-corrientes/${customerId}/imprimir`, query: { desde: fromDay.value, hasta: toDay.value } } }
])

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
          <UDropdownMenu
            :items="moreActions"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              aria-label="Más acciones"
              color="neutral"
              variant="ghost"
            />
          </UDropdownMenu>
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
            v-if="statement.total > pageSize"
            v-model:page="page"
            :total="statement.total"
            :items-per-page="pageSize"
            class="self-center"
          />
        </template>
      </div>

      <PaymentSheet
        v-if="current"
        v-model:open="paying"
        :customer="current.customer"
        @recorded="onBalanceChanged"
      />
      <BalanceEntryModal
        v-if="current"
        v-model:open="entryOpen"
        :kind="entryKind"
        :customer="current.customer"
        :balance="current.balance"
        @saved="onEntrySaved"
      />
    </template>
  </UDashboardPanel>
</template>
