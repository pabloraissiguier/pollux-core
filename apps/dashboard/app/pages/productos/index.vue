<script setup lang="ts">
import type { Product } from '~/utils/products'

useSeoMeta({ title: 'Productos' })

const { request } = useApi()
const { data: categories } = useCategories()

// The filters live in the URL, so coming back from a Product keeps the search and Category.
const { search, searched, filters: { categoryId, showInactive }, values, page, pageSize, paging, sources } = useListQuery({
  search: 'q',
  filters: { categoryId: textParam('categoria'), showInactive: flagParam('inactivos') }
})

const { data: products, status } = useLazyAsyncData(
  'productos',
  () => request(c => c.products.$get({
    query: {
      q: searched.value || undefined,
      categoryId: values.value.categoryId,
      // Left out, the API returns Active and Inactive Products together.
      active: showInactive.value ? undefined : 'true',
      ...paging.value
    }
  })),
  { watch: sources }
)

const hasFilters = computed(() => !!searched.value || !!values.value.categoryId)

function productSubtitle(product: Product) {
  return [product.code, product.brand, product.category?.name].filter(Boolean).join(' · ')
}
</script>

<template>
  <UDashboardPanel id="productos">
    <template #header>
      <UDashboardNavbar title="Productos">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/productos/categorias"
            icon="i-lucide-tags"
            aria-label="Categorías"
            color="neutral"
            variant="ghost"
          />
          <UButton
            to="/productos/conteo-inicial"
            icon="i-lucide-clipboard-list"
            aria-label="Conteo inicial"
            color="neutral"
            variant="ghost"
          />
          <UButton
            to="/productos/nuevo"
            icon="i-lucide-plus"
            label="Nuevo producto"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div
          role="search"
          class="flex w-full flex-col gap-2 py-2 sm:flex-row sm:items-center"
        >
          <UInput
            v-model="search"
            type="search"
            icon="i-lucide-search"
            :loading="status === 'pending'"
            placeholder="Buscar por nombre, código o marca"
            aria-label="Buscar por nombre, código o marca"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="search"
            class="w-full sm:max-w-sm"
          />
          <USelectMenu
            v-model="categoryId"
            :items="categories"
            value-key="id"
            label-key="name"
            icon="i-lucide-tag"
            placeholder="Todas las categorías"
            aria-label="Categoría"
            :search-input="{ placeholder: 'Buscar categoría', autofocus: false }"
            clear
            class="w-full sm:w-56"
          />
          <USwitch
            v-model="showInactive"
            label="Mostrar inactivos"
            class="py-1"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <SkeletonList
        v-if="status === 'pending' && !products"
        trailing
      />

      <UEmpty
        v-else-if="!products?.items.length && hasFilters"
        icon="i-lucide-search-x"
        title="No encontramos productos"
        description="Probá con otro nombre, código, marca o categoría."
        variant="naked"
      />

      <UEmpty
        v-else-if="!products?.items.length"
        icon="i-lucide-boxes"
        title="Todavía no hay productos"
        description="Cargá el primero con su código, nombre y precio."
        variant="naked"
      />

      <template v-else-if="products">
        <UPageList divide>
          <!-- The whole row is the link, so it's an easy target for a thumb. -->
          <ULink
            v-for="product in products.items"
            :key="product.id"
            :to="`/productos/${product.id}`"
            class="relative flex items-center justify-between gap-3 py-3"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-medium text-highlighted">{{ product.name }}</span>
              <span class="truncate text-sm text-muted">{{ productSubtitle(product) }}</span>
              <span class="truncate text-sm text-muted tabular-nums">
                Físico {{ formatUnits(product.stock.onHand) }} · Reservado {{ formatUnits(product.stock.reserved) }}
              </span>
            </span>
            <span class="flex shrink-0 flex-col items-end gap-1">
              <span class="font-medium text-highlighted tabular-nums">{{ formatMoney(product.price) }}</span>
              <span
                class="flex items-center gap-1 text-sm tabular-nums"
                :class="product.stock.available < 0 ? 'font-semibold text-error' : 'text-muted'"
              >
                <span
                  v-if="product.stock.available < 0"
                  role="img"
                  aria-label="Stock disponible negativo"
                  class="flex"
                >
                  <UIcon
                    name="i-lucide-triangle-alert"
                    class="size-4"
                  />
                </span>
                Disponible {{ formatUnits(product.stock.available) }}
              </span>
              <UBadge
                v-if="!product.isActive"
                label="Inactivo"
                color="neutral"
                variant="subtle"
                size="sm"
              />
            </span>
          </ULink>
        </UPageList>

        <UPagination
          v-if="products.total > pageSize"
          v-model:page="page"
          :total="products.total"
          :items-per-page="pageSize"
          class="self-center"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
