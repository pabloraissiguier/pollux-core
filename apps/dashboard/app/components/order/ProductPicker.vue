<script setup lang="ts">
import type { Product } from '~/utils/products'

/**
 * Finds Active Products by search or by Category, with their Price and Available stock, and adds
 * them to the Order with one tap. `inOrder` is each Product's quantity already on the Order.
 */
defineProps<{ inOrder: Record<string, number> }>()
const emit = defineEmits<{ add: [product: Product] }>()

const SEARCH_DELAY_MS = 250
const RESULTS = 50

const { request } = useApi()
const { data: categories } = await useCategories()

const search = ref('')
const searchedText = ref('')
const categoryId = ref<string | undefined>()

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchedText.value = value.trim()
  }, SEARCH_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const browsing = computed(() => !!searchedText.value || !!categoryId.value)

const { data: products, status } = await useAsyncData(
  'pedido-productos',
  () => browsing.value
    ? request(c => c.products.$get({
        query: {
          q: searchedText.value || undefined,
          categoryId: categoryId.value || undefined,
          active: 'true',
          limit: String(RESULTS)
        }
      }))
    : Promise.resolve(null),
  { watch: [searchedText, categoryId] }
)
</script>

<template>
  <section
    aria-labelledby="agregar-productos"
    class="flex flex-col gap-3"
  >
    <h2
      id="agregar-productos"
      class="font-semibold text-highlighted"
    >
      Agregar productos
    </h2>

    <div
      role="search"
      class="flex flex-col gap-2 sm:flex-row"
    >
      <UInput
        v-model="search"
        type="search"
        icon="i-lucide-search"
        placeholder="Nombre, código o marca"
        aria-label="Buscar producto"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="search"
        class="w-full"
      />
      <USelectMenu
        v-model="categoryId"
        :items="categories"
        value-key="id"
        label-key="name"
        icon="i-lucide-tag"
        placeholder="Categoría"
        aria-label="Categoría"
        :search-input="{ placeholder: 'Buscar categoría', autofocus: false }"
        clear
        class="w-full sm:w-56"
      />
    </div>

    <p
      v-if="!browsing"
      class="text-sm text-muted"
    >
      Buscá un producto o elegí una categoría.
    </p>

    <USkeleton
      v-else-if="status === 'pending' && !products"
      class="h-24 w-full"
    />

    <UEmpty
      v-else-if="!products?.items.length"
      icon="i-lucide-search-x"
      title="No encontramos productos"
      description="Probá con otro nombre, código, marca o categoría."
      variant="naked"
    />

    <ul
      v-else
      class="divide-y divide-default"
    >
      <li
        v-for="product in products.items"
        :key="product.id"
        class="flex items-center justify-between gap-3 py-2"
      >
        <span class="flex min-w-0 flex-col">
          <span class="truncate font-medium text-highlighted">{{ product.name }}</span>
          <span class="truncate text-sm text-muted tabular-nums">
            {{ product.code }} · {{ formatMoney(product.price) }}
          </span>
          <span
            class="flex items-center gap-1 text-sm tabular-nums"
            :class="product.stock.available <= 0 ? 'text-error' : 'text-muted'"
          >
            <UIcon
              v-if="product.stock.available <= 0"
              name="i-lucide-triangle-alert"
              class="size-4 shrink-0"
            />
            Disponible {{ formatUnits(product.stock.available) }}
          </span>
        </span>
        <span class="flex shrink-0 items-center gap-2">
          <UBadge
            v-if="inOrder[product.id]"
            :label="`${formatUnits(inOrder[product.id]!)} en el pedido`"
            color="primary"
            variant="subtle"
          />
          <UButton
            icon="i-lucide-plus"
            :aria-label="`Agregar ${product.name}`"
            color="primary"
            variant="soft"
            @click="emit('add', product)"
          />
        </span>
      </li>
    </ul>
  </section>
</template>
