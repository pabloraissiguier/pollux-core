<script setup lang="ts">
import type { Product } from '~/utils/products'

useSeoMeta({ title: 'Productos' })

const PAGE_SIZE = 50
const SEARCH_DELAY_MS = 300

const route = useRoute()
const router = useRouter()
const { request } = useApi()
const { data: categories } = await useCategories()

const queryText = (value: unknown) => (typeof value === 'string' ? value : '')

// The filters live in the URL, so coming back from a Product keeps the search and Category.
const search = ref(queryText(route.query.q))
const categoryId = ref<string | null | undefined>(queryText(route.query.categoria) || undefined)
const showInactive = ref(route.query.inactivos === '1')
const page = ref(Number(route.query.pagina) || 1)

// The search waits for a pause in typing instead of asking the API on every key.
const searchedText = ref(search.value)
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchedText.value = value.trim()
    page.value = 1
  }, SEARCH_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(searchTimer))
watch([categoryId, showInactive], () => {
  page.value = 1
})

watch([searchedText, categoryId, showInactive, page], ([q, categoria, inactivos, pagina]) => {
  router.replace({
    query: {
      q: q || undefined,
      categoria: categoria || undefined,
      inactivos: inactivos ? '1' : undefined,
      pagina: pagina > 1 ? pagina : undefined
    }
  })
})

const { data: products, status } = await useAsyncData(
  'productos',
  () => request(c => c.products.$get({
    query: {
      q: searchedText.value || undefined,
      categoryId: categoryId.value || undefined,
      // Left out, the API returns Active and Inactive Products together.
      active: showInactive.value ? undefined : 'true',
      limit: String(PAGE_SIZE),
      offset: String((page.value - 1) * PAGE_SIZE)
    }
  })),
  { watch: [searchedText, categoryId, showInactive, page] }
)

const hasFilters = computed(() => !!searchedText.value || !!categoryId.value)

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
      <USkeleton
        v-if="status === 'pending' && !products"
        class="h-32 w-full"
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
          v-if="products.total > PAGE_SIZE"
          v-model:page="page"
          :total="products.total"
          :items-per-page="PAGE_SIZE"
          class="self-center"
        />
      </template>
    </template>
  </UDashboardPanel>
</template>
