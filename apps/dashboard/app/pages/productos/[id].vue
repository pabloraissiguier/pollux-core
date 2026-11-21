<script setup lang="ts">
import type { Product } from '~/utils/products'

const route = useRoute()
const { request } = useApi()
const toast = useToast()
const id = String(route.params.id)

const { data: product, status } = await useAsyncData(
  `producto-${id}`,
  () => request(c => c.products[':id'].$get({ param: { id } }))
)

// The latest 50 changes are plenty to see how a Price has moved.
const { data: history, refresh: refreshHistory } = await useAsyncData(
  `producto-${id}-precios`,
  () => request(c => c.products[':id']['price-history'].$get({ param: { id }, query: { limit: '50' } }))
)

// Newest first. "Ver más" asks for a longer list, up to the API's page limit.
const MOVEMENTS_STEP = 20
const MOVEMENTS_MAX = 200
const movementsLimit = ref(MOVEMENTS_STEP)
const { data: movements, status: movementsStatus, refresh: refreshMovements } = await useAsyncData(
  `producto-${id}-movimientos`,
  () => request(c => c.stock.movements.$get({ query: { productId: id, limit: String(movementsLimit.value) } })),
  { watch: [movementsLimit] }
)
const canShowMoreMovements = computed(() => !!movements.value
  && movements.value.total > movements.value.items.length
  && movementsLimit.value < MOVEMENTS_MAX)

useSeoMeta({ title: () => product.value?.name ?? 'Producto' })

const editing = ref(false)
const changingPrice = ref(false)
const adjustingStock = ref(false)
const togglingActive = ref(false)

// Every write answers with the whole Product, so it replaces what the page shows.
function onSaved(saved: Product) {
  product.value = saved
}

async function onPriceSaved(saved: Product) {
  product.value = saved
  await refreshHistory()
}

async function onStockAdjusted(saved: Product) {
  product.value = saved
  await refreshMovements()
}

async function setActive(isActive: boolean) {
  togglingActive.value = true
  try {
    product.value = await request(c => c.products[':id'].$patch({ param: { id }, json: { isActive } }))
    toast.add({
      title: isActive ? 'Producto reactivado' : 'Producto desactivado',
      color: 'success',
      icon: isActive ? 'i-lucide-eye' : 'i-lucide-eye-off'
    })
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    togglingActive.value = false
  }
}

function changeSummary(change: { oldPrice: string | null, newPrice: string }) {
  return change.oldPrice === null
    ? `Precio inicial: ${formatMoney(change.newPrice)}`
    : `${formatMoney(change.oldPrice)} → ${formatMoney(change.newPrice)}`
}
</script>

<template>
  <UDashboardPanel id="producto">
    <template #header>
      <UDashboardNavbar :title="product?.name ?? 'Producto'">
        <template #leading>
          <UButton
            to="/productos"
            icon="i-lucide-arrow-left"
            aria-label="Volver a productos"
            color="neutral"
            variant="ghost"
          />
        </template>

        <template
          v-if="product"
          #right
        >
          <UButton
            label="Editar"
            icon="i-lucide-pencil"
            color="neutral"
            variant="outline"
            @click="editing = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <USkeleton
        v-if="status === 'pending' && !product"
        class="h-48 w-full"
      />

      <UEmpty
        v-else-if="!product"
        icon="i-lucide-package-x"
        title="No encontramos el producto"
        :actions="[{ label: 'Ver productos', icon: 'i-lucide-boxes', to: '/productos' }]"
        variant="naked"
      />

      <div
        v-else
        class="flex w-full max-w-2xl flex-col gap-4"
      >
        <UCard>
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div class="flex flex-col">
              <span class="text-sm text-muted">Precio</span>
              <span class="text-2xl font-semibold text-highlighted tabular-nums">{{ formatMoney(product.price) }}</span>
            </div>
            <UButton
              label="Cambiar precio"
              icon="i-lucide-tag"
              @click="changingPrice = true"
            />
          </div>

          <USeparator class="my-4" />

          <dl class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt class="text-muted">
              Código
            </dt>
            <dd class="text-highlighted">
              {{ product.code }}
            </dd>
            <dt class="text-muted">
              Marca
            </dt>
            <dd class="text-highlighted">
              {{ product.brand ?? '—' }}
            </dd>
            <dt class="text-muted">
              Categoría
            </dt>
            <dd class="text-highlighted">
              {{ product.category?.name ?? 'Sin categoría' }}
            </dd>
            <dt class="text-muted">
              Alícuota de IVA
            </dt>
            <dd class="text-highlighted">
              {{ formatPercent(product.vatRate) }}
            </dd>
          </dl>

          <USeparator class="my-4" />

          <USwitch
            :model-value="product.isActive"
            :loading="togglingActive"
            :disabled="togglingActive"
            label="Activo"
            :description="product.isActive
              ? 'Se puede vender y aparece en el catálogo.'
              : 'Inactivo: no aparece en la toma de pedidos ni en el catálogo.'"
            @update:model-value="setActive"
          />
        </UCard>

        <UCard>
          <section
            aria-labelledby="stock"
            class="flex flex-col gap-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-3">
              <h2
                id="stock"
                class="font-semibold text-highlighted"
              >
                Stock
              </h2>
              <UButton
                label="Ajustar stock"
                icon="i-lucide-package-plus"
                color="neutral"
                variant="outline"
                @click="adjustingStock = true"
              />
            </div>

            <ProductStockFigures :stock="product.stock" />
          </section>
        </UCard>

        <UCard>
          <section aria-labelledby="movimientos-stock">
            <h2
              id="movimientos-stock"
              class="mb-2 font-semibold text-highlighted"
            >
              Movimientos de stock
            </h2>

            <USkeleton
              v-if="movementsStatus === 'pending' && !movements"
              class="h-16 w-full"
            />
            <ul
              v-else-if="movements?.items.length"
              class="divide-y divide-default"
            >
              <li
                v-for="movement in movements.items"
                :key="movement.id"
                class="flex items-start justify-between gap-3 py-2"
              >
                <span class="flex min-w-0 flex-col">
                  <span class="text-highlighted">{{ movementCause(movement) }}</span>
                  <span
                    v-if="movement.notes"
                    class="text-sm text-default"
                  >{{ movement.notes }}</span>
                  <span class="text-sm text-muted">
                    {{ formatDate(movement.createdAt) }}<template v-if="movement.createdBy?.fullName"> · {{ movement.createdBy.fullName }}</template>
                  </span>
                </span>
                <span
                  class="shrink-0 font-medium tabular-nums"
                  :class="movement.quantity < 0 ? 'text-error' : 'text-success'"
                >{{ formatUnitsChange(movement.quantity) }}</span>
              </li>
            </ul>
            <p
              v-else
              class="text-sm text-muted"
            >
              Sin movimientos de stock.
            </p>

            <UButton
              v-if="canShowMoreMovements"
              label="Ver más"
              color="neutral"
              variant="ghost"
              :loading="movementsStatus === 'pending'"
              block
              class="mt-2"
              @click="movementsLimit = Math.min(movementsLimit + MOVEMENTS_STEP * 2, MOVEMENTS_MAX)"
            />
          </section>
        </UCard>

        <UCard>
          <section aria-labelledby="historial-precios">
            <h2
              id="historial-precios"
              class="mb-2 font-semibold text-highlighted"
            >
              Historial de precios
            </h2>

            <ul
              v-if="history?.items.length"
              class="divide-y divide-default"
            >
              <li
                v-for="change in history.items"
                :key="change.id"
                class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2"
              >
                <span class="text-highlighted tabular-nums">{{ changeSummary(change) }}</span>
                <span class="text-sm text-muted">
                  {{ formatDate(change.changedAt) }}<template v-if="change.changedBy?.fullName"> · {{ change.changedBy.fullName }}</template>
                </span>
              </li>
            </ul>
            <p
              v-else
              class="text-sm text-muted"
            >
              Sin cambios de precio.
            </p>
          </section>
        </UCard>

        <ProductEditModal
          v-model:open="editing"
          :product="product"
          @saved="onSaved"
        />
        <ProductStockAdjustmentModal
          v-model:open="adjustingStock"
          :product="product"
          @saved="onStockAdjusted"
        />
        <ProductPriceChangeModal
          v-model:open="changingPrice"
          :product="product"
          @saved="onPriceSaved"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
