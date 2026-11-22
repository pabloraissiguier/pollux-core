<script setup lang="ts">
import type { Branch, Customer } from '~/utils/customers'

const route = useRoute()
const { request } = useApi()
const id = String(route.params.id)

const { data: customer, status } = await useAsyncData(
  `cliente-${id}`,
  () => request(c => c.customers[':id'].$get({ param: { id } }))
)

useSeoMeta({ title: () => customer.value?.name ?? 'Cliente' })

/** How many Orders the page shows; the rest are in Pedidos, filtered by this Customer. */
const RECENT_ORDERS = 5

const { data: balance } = await useAsyncData(
  `cliente-${id}-saldo`,
  async () => (await request(c => c.customers[':id'].balance.$get({ param: { id } }))).balance
)

const { data: recentOrders } = await useAsyncData(
  `cliente-${id}-pedidos`,
  () => request(c => c.orders.$get({ query: { customerId: id, limit: String(RECENT_ORDERS) } }))
)

const editing = ref(false)
const branchOpen = ref(false)
const editedBranch = ref<Branch | null>(null)

function addBranch() {
  editedBranch.value = null
  branchOpen.value = true
}

function editBranch(branch: Branch) {
  editedBranch.value = branch
  branchOpen.value = true
}

// Every write answers with the whole Customer, so it replaces what the page shows.
function onSaved(saved: Customer) {
  customer.value = saved
}
</script>

<template>
  <UDashboardPanel id="cliente">
    <template #header>
      <UDashboardNavbar :title="customer?.name ?? 'Cliente'">
        <template #leading>
          <UButton
            to="/clientes"
            icon="i-lucide-arrow-left"
            aria-label="Volver a clientes"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <USkeleton
        v-if="status === 'pending' && !customer"
        class="h-48 w-full"
      />

      <UEmpty
        v-else-if="!customer"
        icon="i-lucide-user-x"
        title="No encontramos el cliente"
        :actions="[{ label: 'Ver clientes', icon: 'i-lucide-users', to: '/clientes' }]"
        variant="naked"
      />

      <div
        v-else
        class="flex w-full max-w-2xl flex-col gap-4"
      >
        <UCard>
          <div class="flex flex-wrap items-end justify-between gap-3">
            <CustomerBalanceFigure
              v-if="balance"
              :balance="balance"
            />
            <USkeleton
              v-else
              class="h-20 w-40"
            />
            <UButton
              :to="`/cuentas-corrientes/${customer.id}`"
              label="Ver resumen de cuenta"
              icon="i-lucide-receipt-text"
              color="neutral"
              variant="outline"
            />
          </div>
        </UCard>

        <UCard
          as="section"
          aria-labelledby="cliente-pedidos-recientes"
        >
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <h2
                id="cliente-pedidos-recientes"
                class="font-semibold text-highlighted"
              >
                Pedidos recientes
              </h2>
              <UButton
                v-if="recentOrders?.items.length"
                :to="{ path: '/pedidos', query: { cliente: customer.id } }"
                label="Ver todos"
                color="neutral"
                variant="link"
              />
            </div>
          </template>

          <p
            v-if="!recentOrders?.items.length"
            class="text-muted"
          >
            Todavía no tiene pedidos.
          </p>
          <UPageList
            v-else
            divide
          >
            <ULink
              v-for="order in recentOrders.items"
              :key="order.id"
              :to="`/pedidos/${order.id}`"
              class="relative flex items-center justify-between gap-3 py-3"
            >
              <span class="flex min-w-0 flex-col">
                <span class="font-medium text-highlighted tabular-nums">N° {{ order.number }}</span>
                <span class="truncate text-sm text-muted">
                  {{ order.deliveredOn ? `Entregado ${formatDate(order.deliveredOn)}` : `Entrega ${formatDate(order.deliveryDate)}` }}
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
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-semibold text-highlighted">
                Datos
              </h2>
              <UButton
                label="Editar"
                icon="i-lucide-pencil"
                color="neutral"
                variant="outline"
                @click="editing = true"
              />
            </div>
          </template>

          <dl class="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3">
            <template v-if="customer.legalName">
              <dt class="text-muted">
                Razón social
              </dt>
              <dd>{{ customer.legalName }}</dd>
            </template>
            <dt class="text-muted">
              CUIT
            </dt>
            <dd>{{ customer.cuit ?? '—' }}</dd>
            <dt class="text-muted">
              IVA
            </dt>
            <dd>{{ customer.vatCondition ? vatConditionLabels[customer.vatCondition] : '—' }}</dd>
            <dt class="text-muted">
              Teléfono
            </dt>
            <dd>
              <UButton
                v-if="customer.phone"
                :to="phoneHref(customer.phone)"
                :label="customer.phone"
                :aria-label="`Llamar al ${customer.phone}`"
                icon="i-lucide-phone"
                variant="link"
              />
              <template v-else>
                —
              </template>
            </dd>
            <template v-if="customer.notes">
              <dt class="text-muted">
                Notas
              </dt>
              <dd class="whitespace-pre-line">
                {{ customer.notes }}
              </dd>
            </template>
          </dl>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-2">
              <h2 class="font-semibold text-highlighted">
                Sucursales
              </h2>
              <UButton
                label="Agregar sucursal"
                icon="i-lucide-plus"
                color="neutral"
                variant="outline"
                @click="addBranch"
              />
            </div>
          </template>

          <UPageList divide>
            <div
              v-for="branch in customer.branches"
              :key="branch.id"
              class="relative flex items-start justify-between gap-2 py-3"
            >
              <div class="min-w-0">
                <p
                  v-if="branch.name"
                  class="font-medium text-highlighted"
                >
                  {{ branch.name }}
                </p>
                <p>{{ branch.address }}</p>
                <p class="text-muted">
                  {{ branch.city }}
                </p>
                <p
                  v-if="branch.notes"
                  class="text-sm whitespace-pre-line text-muted"
                >
                  {{ branch.notes }}
                </p>
              </div>
              <UButton
                icon="i-lucide-pencil"
                :aria-label="`Editar sucursal ${branch.address}`"
                color="neutral"
                variant="ghost"
                @click="editBranch(branch)"
              />
            </div>
          </UPageList>
        </UCard>

        <CustomerEditModal
          v-model:open="editing"
          :customer="customer"
          @saved="onSaved"
        />
        <CustomerBranchFormModal
          v-model:open="branchOpen"
          :customer-id="customer.id"
          :branch="editedBranch"
          @saved="onSaved"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
