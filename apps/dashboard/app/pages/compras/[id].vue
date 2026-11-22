<script setup lang="ts">
const route = useRoute()
const { request } = useApi()
const id = String(route.params.id)

const { data: purchase, status } = await useAsyncData(
  `compra-${id}`,
  () => request(c => c.purchases[':id'].$get({ param: { id } }))
)

const title = computed(() => (purchase.value ? `Compra a ${purchase.value.supplier.name}` : 'Compra'))
useSeoMeta({ title })
</script>

<template>
  <UDashboardPanel id="compra">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UButton
            to="/compras"
            icon="i-lucide-arrow-left"
            aria-label="Volver a compras"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <USkeleton
        v-if="status === 'pending' && !purchase"
        class="h-48 w-full"
      />

      <UEmpty
        v-else-if="!purchase"
        icon="i-lucide-package-x"
        title="No encontramos la compra"
        :actions="[{ label: 'Ver compras', icon: 'i-lucide-package-plus', to: '/compras' }]"
        variant="naked"
      />

      <div
        v-else
        class="flex w-full max-w-2xl flex-col gap-4"
      >
        <UCard
          as="section"
          aria-label="Datos de la compra"
        >
          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt class="text-muted">
              Proveedor
            </dt>
            <dd class="text-highlighted">
              {{ purchase.supplier.name }}
            </dd>
            <dt class="text-muted">
              Fecha
            </dt>
            <dd class="text-highlighted tabular-nums">
              {{ formatDate(purchase.purchasedOn) }}
            </dd>
            <dt class="text-muted">
              Factura
            </dt>
            <dd class="text-highlighted">
              {{ purchase.invoiceNumber ?? 'Sin número' }}
            </dd>
            <template v-if="purchase.notes">
              <dt class="text-muted">
                Notas
              </dt>
              <dd class="whitespace-pre-line text-highlighted">
                {{ purchase.notes }}
              </dd>
            </template>
            <dt class="text-muted">
              Registrada
            </dt>
            <dd class="text-highlighted">
              {{ formatDate(purchase.createdAt) }}<template v-if="purchase.createdBy?.fullName">
                por {{ purchase.createdBy.fullName }}
              </template>
            </dd>
          </dl>
        </UCard>

        <UCard
          as="section"
          aria-labelledby="compra-productos"
        >
          <template #header>
            <h2
              id="compra-productos"
              class="font-semibold text-highlighted"
            >
              Productos
            </h2>
          </template>

          <ul class="divide-y divide-default">
            <li
              v-for="line in purchase.lines"
              :key="line.id"
              class="flex items-start justify-between gap-3 py-2"
            >
              <span class="flex min-w-0 flex-col">
                <ULink
                  :to="`/productos/${line.product.id}`"
                  class="truncate font-medium text-highlighted"
                >{{ line.product.name }}</ULink>
                <span class="truncate text-sm text-muted tabular-nums">
                  {{ line.product.code }} · {{ formatUnits(line.quantity) }} × {{ formatMoney(line.unitCost) }}
                </span>
              </span>
              <span class="shrink-0 font-medium text-highlighted tabular-nums">{{ formatMoney(line.subtotal) }}</span>
            </li>
          </ul>

          <template #footer>
            <p class="flex items-center justify-between gap-3 font-semibold text-highlighted">
              <span>Total</span>
              <span class="tabular-nums">{{ formatMoney(purchase.total) }}</span>
            </p>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
