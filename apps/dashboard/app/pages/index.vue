<script setup lang="ts">
import { sumMoney } from '@pollux/contracts'
import { ordersCountLabel } from '~/utils/orders'

/**
 * Inicio: the day at a glance (Products to restock, today's Orders still to deliver, what all
 * Customers owe) and the two everyday actions one tap away.
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

// Stock a reponer: Products whose Available stock is below zero, largest shortfall first, with the
// Pending Orders that reserve them. Shown only when there is one.
const SHORTAGES_SHOWN = 50
const { data: shortages } = await useAsyncData(
  'inicio-stock-a-reponer',
  () => request(c => c.stock.shortages.$get({ query: { limit: String(SHORTAGES_SHOWN) } })),
  { lazy: true }
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

        <UCard
          v-if="shortages?.items.length"
          as="section"
          aria-labelledby="inicio-stock-a-reponer"
        >
          <template #header>
            <h2
              id="inicio-stock-a-reponer"
              class="flex items-center gap-2 font-semibold text-highlighted"
            >
              <UIcon
                name="i-lucide-package-x"
                class="size-5 shrink-0 text-warning"
              />
              Stock a reponer
            </h2>
          </template>

          <ul class="divide-y divide-default">
            <li
              v-for="shortage in shortages.items"
              :key="shortage.product.id"
              class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0"
            >
              <ULink
                :to="`/productos/${shortage.product.id}`"
                class="flex flex-col"
              >
                <span class="font-medium text-highlighted">{{ shortage.product.name }}</span>
                <span class="text-sm text-muted">{{ shortage.product.code }}</span>
              </ULink>
              <OrderStockWarning :available="shortage.stock.available" />
              <ul
                v-if="shortage.orders.length"
                :aria-label="`Pedidos pendientes con ${shortage.product.name}`"
                class="flex flex-col gap-1"
              >
                <li
                  v-for="order in shortage.orders"
                  :key="order.id"
                >
                  <ULink
                    :to="`/pedidos/${order.id}`"
                    class="text-sm"
                  >
                    N° {{ order.number }} · {{ order.customer.name }} · {{ formatDate(order.deliveryDate) }} · {{ formatUnits(order.quantity) }} u.
                  </ULink>
                </li>
              </ul>
              <span
                v-else
                class="text-sm text-muted"
              >Ningún pedido pendiente lo reserva: el stock físico es negativo.</span>
            </li>
          </ul>

          <p
            v-if="shortages.total > shortages.items.length"
            class="mt-3 text-sm text-muted"
          >
            Se muestran los {{ shortages.items.length }} con mayor faltante de {{ shortages.total }}.
          </p>
        </UCard>

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
