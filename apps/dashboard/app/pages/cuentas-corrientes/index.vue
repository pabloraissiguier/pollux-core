<script setup lang="ts">
import { balanceAmountText, debitOrCredit } from '~/utils/balance'

/**
 * Cuentas corrientes: who to collect from. Every Customer whose Balance isn't zero, largest
 * first (credits last), and the grand total the business is owed, net of credits.
 */
useSeoMeta({ title: 'Cuentas corrientes' })

const PAGE_SIZE = 50

const route = useRoute()
const router = useRouter()
const { request } = useApi()

const page = ref(Number(route.query.pagina) || 1)
watch(page, (pagina) => {
  router.replace({ query: { pagina: pagina > 1 ? pagina : undefined } })
})

const { data: balances, status, refresh } = await useAsyncData(
  'cuentas-corrientes',
  () => request(c => c.customers['with-balance'].$get({
    query: { limit: String(PAGE_SIZE), offset: String((page.value - 1) * PAGE_SIZE) }
  })),
  { watch: [page] }
)

const total = computed(() => debitOrCredit(balances.value?.balanceTotal ?? '0.00'))

// Registrar pago straight from a row: the Customer is the row's, so the sheet needs no picker.
const paying = ref(false)
const payingCustomer = ref<{ id: string, name: string } | null>(null)

async function pay(customer: { id: string, name: string }) {
  payingCustomer.value = customer
  // The sheet resets its form when it opens, so it has to be mounted before `paying` turns true.
  await nextTick()
  paying.value = true
}
</script>

<template>
  <UDashboardPanel id="cuentas-corrientes">
    <template #header>
      <UDashboardNavbar title="Cuentas corrientes">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex w-full max-w-2xl flex-col gap-4">
        <UCard v-if="balances">
          <div class="flex flex-col gap-1">
            <span class="text-sm text-muted">Total a cobrar</span>
            <span
              role="status"
              aria-label="Total a cobrar"
              class="text-3xl font-semibold text-highlighted tabular-nums"
            >{{ total.side === 'credit' ? `-${formatMoney(total.amount)}` : formatMoney(total.amount) }}</span>
            <span class="text-sm text-muted">
              {{ balances.total === 1 ? '1 cliente con saldo' : `${balances.total} clientes con saldo` }}
            </span>
          </div>
        </UCard>

        <USkeleton
          v-if="status === 'pending' && !balances"
          class="h-48 w-full"
        />

        <UEmpty
          v-else-if="!balances?.items.length"
          icon="i-lucide-circle-check"
          title="Nadie debe nada"
          description="Todos los clientes están al día."
          variant="naked"
        />

        <template v-else>
          <UCard>
            <ul
              aria-label="Clientes con saldo"
              class="divide-y divide-default"
            >
              <li
                v-for="row in balances.items"
                :key="row.customer.id"
                class="flex items-center gap-2"
              >
                <ULink
                  :to="`/cuentas-corrientes/${row.customer.id}`"
                  class="flex min-w-0 flex-1 items-center justify-between gap-3 py-3"
                >
                  <span class="truncate font-medium text-highlighted">{{ row.customer.name }}</span>
                  <span
                    class="shrink-0 tabular-nums"
                    :class="debitOrCredit(row.balance).side === 'credit' ? 'text-success' : 'text-highlighted'"
                  >{{ balanceAmountText(row.balance) }}</span>
                </ULink>
                <UButton
                  icon="i-lucide-banknote"
                  :aria-label="`Registrar pago de ${row.customer.name}`"
                  color="neutral"
                  variant="ghost"
                  @click="pay(row.customer)"
                />
              </li>
            </ul>
          </UCard>

          <UPagination
            v-if="balances.total > PAGE_SIZE"
            v-model:page="page"
            :total="balances.total"
            :items-per-page="PAGE_SIZE"
            class="self-center"
          />
        </template>
      </div>

      <PaymentSheet
        v-if="payingCustomer"
        v-model:open="paying"
        :customer="payingCustomer"
        @recorded="refresh()"
      />
    </template>
  </UDashboardPanel>
</template>
