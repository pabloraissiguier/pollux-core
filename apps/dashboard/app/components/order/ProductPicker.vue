<script setup lang="ts">
import type { Product } from '~/utils/products'

/**
 * Finds Active Products by search or by Category, with their Price and Available stock, and adds
 * them to the Order with one tap. `inOrder` is each Product's quantity already on the Order.
 *
 * At the PC the search is a combobox: the arrow keys move through the results and Enter adds the
 * highlighted one (the first by default), leaving the text selected so Enter again adds one more
 * and typing starts the next search. On a touch screen the keyboard's search key only searches.
 */
defineProps<{ inOrder: Record<string, number> }>()
const emit = defineEmits<{ add: [product: Product] }>()

const SEARCH_DELAY_MS = 250
const RESULT_LIMIT = 50

const { request } = useApi()
const { data: categories } = useCategories()

const search = ref('')
const searchedText = ref('')
const categoryId = ref<string | undefined>()

const searchInput = useTemplateRef('searchInput')
const listboxId = useId()
const optionId = (index: number) => `${listboxId}-${index}`
const highlighted = ref(0)
// Enter pressed before the results of the typed text arrived: add the highlighted one once they do.
const addWhenLoaded = ref(false)

let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(search, (value) => {
  addWhenLoaded.value = false
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => searchNow(value), SEARCH_DELAY_MS)
})
watch(categoryId, () => {
  addWhenLoaded.value = false
})
onBeforeUnmount(() => clearTimeout(searchTimer))

function searchNow(value: string) {
  clearTimeout(searchTimer)
  searchedText.value = value.trim()
}

const browsing = computed(() => !!searchedText.value || !!categoryId.value)

const { data: products, status } = useLazyAsyncData(
  'pedido-productos',
  () => browsing.value
    ? request(c => c.products.$get({
        query: {
          q: searchedText.value || undefined,
          categoryId: categoryId.value || undefined,
          active: 'true',
          limit: String(RESULT_LIMIT)
        }
      }))
    : Promise.resolve(null),
  { watch: [searchedText, categoryId] }
)

const results = computed(() => products.value?.items ?? [])

watch(products, () => {
  highlighted.value = 0
})
// A pending Enter is used up by the next load, whether it brings results or fails.
watch(status, (now) => {
  if (!addWhenLoaded.value || now === 'pending' || now === 'idle') return
  addWhenLoaded.value = false
  if (now === 'success') addHighlighted()
})

/** On a touch screen the search key only searches: a Product is added by tapping it. */
const touchScreen = () => window.matchMedia('(pointer: coarse)').matches

/** Adds the Product; at the PC the search takes the focus back with its text selected. */
function add(product: Product) {
  emit('add', product)
  if (touchScreen()) return
  searchInput.value?.inputRef?.focus()
  searchInput.value?.inputRef?.select()
}

function addHighlighted() {
  const product = results.value[highlighted.value]
  if (product) add(product)
}

function move(step: number) {
  if (!results.value.length) return
  highlighted.value = Math.min(Math.max(highlighted.value + step, 0), results.value.length - 1)
  document.getElementById(optionId(highlighted.value))?.scrollIntoView({ block: 'nearest' })
}

/** Enter never submits the Order form: it adds a result, waiting for the typed search if needed. */
function onEnter(event: KeyboardEvent) {
  event.preventDefault()
  if (event.isComposing) return
  const text = search.value.trim()
  if (touchScreen()) {
    searchNow(text)
    searchInput.value?.inputRef?.blur()
    return
  }
  if (!text && !categoryId.value) return
  if (text !== searchedText.value) {
    searchNow(text)
    addWhenLoaded.value = true
  } else if (status.value === 'pending') {
    addWhenLoaded.value = true
  } else {
    addHighlighted()
  }
}
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
        ref="searchInput"
        v-model="search"
        type="search"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="results.length > 0"
        :aria-controls="results.length ? listboxId : undefined"
        :aria-activedescendant="results.length ? optionId(highlighted) : undefined"
        icon="i-lucide-search"
        placeholder="Nombre, código o marca"
        aria-label="Buscar producto"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        enterkeyhint="search"
        class="w-full"
        @keydown.enter="onEnter"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
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

    <SkeletonList
      v-else-if="status === 'pending' && !products"
      :rows="3"
      trailing
    />

    <UEmpty
      v-else-if="!results.length"
      icon="i-lucide-search-x"
      title="No encontramos productos"
      description="Probá con otro nombre, código, marca o categoría."
      variant="naked"
    />

    <!-- Tapping a row adds it. -->
    <ul
      v-else
      :id="listboxId"
      role="listbox"
      aria-label="Resultados"
      class="divide-y divide-default"
    >
      <li
        v-for="(product, index) in results"
        :id="optionId(index)"
        :key="product.id"
        role="option"
        :aria-selected="index === highlighted"
        class="flex cursor-pointer items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-elevated/50 aria-selected:bg-elevated"
        @click="add(product)"
      >
        <span class="flex min-w-0 flex-col">
          <span class="truncate font-medium text-highlighted">{{ product.name }}</span>
          <span class="truncate text-sm text-muted tabular-nums">
            {{ product.code }} · {{ formatMoney(product.price) }}
          </span>
          <span
            class="flex items-center gap-1 text-sm tabular-nums"
            :class="product.stock.available < 0 ? 'text-error' : 'text-muted'"
          >
            <UIcon
              v-if="product.stock.available < 0"
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
          <UIcon
            name="i-lucide-plus"
            class="size-5 text-primary"
          />
        </span>
      </li>
    </ul>
  </section>
</template>
