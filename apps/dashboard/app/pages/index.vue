<script setup lang="ts">
import { sumMoney } from '@pollux/contracts'
import { ordersCountLabel } from '~/utils/orders'

/**
 * Inicio: the day at a glance (today's Orders still to deliver, what all Customers owe) and the
 * two everyday actions one tap away.
 */
useSeoMeta({ title: 'Inicio' })

/** One page holds a whole day, as in the reparto view. */
const PAGE_SIZE = 200

const { request } = useApi()
const today = todayInArgentina()

const { data: toDeliver } = await useAsyncData(
  'inicio-para-entregar',
  () => request(c => c.orders.$get({ query: { status: 'pending', deliveryDate: today, limit: String(PAGE_SIZE) } }))
)
const toDeliverTotal = computed(() => toDeliver.value && sumMoney(toDeliver.value.items.map(o => o.totals.total)))

// Only the grand total is needed, not the list.
const { data: balances, refresh: refreshBalances } = await useAsyncData(
  'inicio-saldo-total',
  () => request(c => c.customers['with-balance'].$get({ query: { limit: '1' } }))
)

const paying = ref(false)
</script>

<template>
  <UDashboardPanel id="inicio">
    <template #header>
      <UDashboardNavbar title="Inicio">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex w-full max-w-2xl flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <UButton
            to="/pedidos/nuevo"
            label="Nuevo pedido"
            icon="i-lucide-clipboard-plus"
            size="xl"
            block
          />
          <UButton
            label="Registrar pago"
            icon="i-lucide-banknote"
            size="xl"
            color="neutral"
            variant="outline"
            block
            @click="paying = true"
          />
        </div>

        <UCard>
          <div class="flex flex-col gap-1">
            <span class="text-sm text-muted">Para entregar hoy · {{ formatDate(today) }}</span>
            <USkeleton
              v-if="!toDeliver"
              class="h-9 w-40"
            />
            <div
              v-else
              class="flex flex-wrap items-baseline justify-between gap-x-3"
            >
              <span
                role="status"
                aria-label="Total para entregar hoy"
                class="text-3xl font-semibold text-highlighted tabular-nums"
              >{{ formatMoney(toDeliverTotal ?? '0') }}</span>
              <span
                role="status"
                aria-label="Pedidos para entregar hoy"
                class="text-muted"
              >{{ toDeliver.total ? ordersCountLabel(toDeliver.total) : 'Ninguno' }}</span>
            </div>
            <span
              v-if="toDeliver && toDeliver.total > toDeliver.items.length"
              class="text-sm text-muted"
            >El total suma los primeros {{ toDeliver.items.length }} pedidos.</span>
          </div>

          <template #footer>
            <UButton
              to="/pedidos/reparto"
              label="Ver reparto"
              icon="i-lucide-truck"
              color="neutral"
              variant="ghost"
              trailing-icon="i-lucide-chevron-right"
              block
            />
          </template>
        </UCard>

        <UCard>
          <div class="flex flex-col gap-1">
            <span class="text-sm text-muted">Saldo total</span>
            <USkeleton
              v-if="!balances"
              class="h-9 w-40"
            />
            <span
              v-else
              role="status"
              aria-label="Saldo total"
              class="text-3xl font-semibold text-highlighted tabular-nums"
            >{{ formatMoney(balances.balanceTotal) }}</span>
            <span class="text-sm text-muted">Lo que deben, menos los saldos a favor</span>
          </div>

          <template #footer>
            <UButton
              to="/cuentas-corrientes"
              label="Ver cuentas corrientes"
              icon="i-lucide-wallet"
              color="neutral"
              variant="ghost"
              trailing-icon="i-lucide-chevron-right"
              block
            />
          </template>
        </UCard>
      </div>

      <PaymentSheet
        v-model:open="paying"
        @recorded="refreshBalances()"
      />
    </template>
  </UDashboardPanel>
</template>
