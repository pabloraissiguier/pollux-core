<script setup lang="ts">
import type { FormErrorEvent } from '@nuxt/ui'
import type { z } from 'zod'
import type { Product } from '~/utils/products'
import { initialCountFormSchema, typedCountTotal } from '~/utils/stock'

useSeoMeta({ title: 'Conteo inicial' })

// The API's largest page. The whole Active catalog is loaded, so search and Category filter on
// the device and never drop a count already typed.
const PAGE_SIZE = 200

const { request } = useApi()
const toast = useToast()
const { data: categories } = useCategories()
const form = useTemplateRef('form')

const { data: products, status } = useLazyAsyncData('conteo-inicial', async () => {
  const items: Product[] = []
  let total = Infinity
  while (items.length < total) {
    const page = await request(c => c.products.$get({
      query: { active: 'true', limit: String(PAGE_SIZE), offset: String(items.length) }
    }))
    items.push(...page.items)
    total = page.items.length ? page.total : items.length
  }
  return items
})

const search = ref('')
const categoryId = ref<string | undefined>()

/** Lowercase and without accents, so "bandeja" finds "Bandéja" and "BAN-1". */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

const shown = computed(() => {
  const words = fold(search.value).split(/\s+/).filter(Boolean)
  return (products.value ?? []).filter((product) => {
    if (categoryId.value && product.category?.id !== categoryId.value) return false
    const text = fold([product.name, product.code, product.brand].filter(Boolean).join(' '))
    return words.every(word => text.includes(word))
  })
})

const state = reactive<{ counts: Record<string, string> }>({ counts: {} })

// A row hidden by the filters right after typing skips its delayed check, so its old error
// would come back with it. Recheck the counts whenever the list changes while errors show (only
// a typed count can be wrong, so this never flags an untouched row).
watch(shown, async () => {
  if (form.value?.getErrors().length) await form.value.validate({ silent: true })
})
const typed = computed(() => typedCountTotal(state.counts))

// No form for API errors: the API names the counts `items.0.quantity`, so they go to a toast.
const { saving, onSubmit } = useFormSubmit<z.output<typeof initialCountFormSchema>>(null, async (items, formRequest) => {
  if (!items.length) return
  const result = await formRequest(c => c.stock['initial-count'].$post({ json: { items } }))
  const saved = new Map(result.items.map(item => [item.product.id, item.product]))
  products.value = products.value?.map(product => saved.get(product.id) ?? product)
  state.counts = {}
  const changed = result.items.filter(item => item.difference !== 0).length
  toast.add({
    title: 'Conteo guardado',
    description: `${formatUnits(result.items.length)} ${result.items.length === 1 ? 'producto contado' : 'productos contados'}, ${formatUnits(changed)} con diferencia.`,
    color: 'success',
    icon: 'i-lucide-check'
  })
})

// A wrong count may sit in a row the filters hide: show every row and go to the first error.
async function onError(event: FormErrorEvent) {
  search.value = ''
  categoryId.value = undefined
  await nextTick()
  const id = event.errors[0]?.id
  if (id) document.getElementById(id)?.focus()
}
</script>

<template>
  <UDashboardPanel id="conteo-inicial">
    <template #header>
      <UDashboardNavbar title="Conteo inicial">
        <template #leading>
          <UButton
            to="/productos"
            icon="i-lucide-arrow-left"
            aria-label="Volver a Productos"
            color="neutral"
            variant="ghost"
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
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        Escribí cuántas unidades contaste. Cada producto queda con esa cantidad de stock físico, y la diferencia se registra como ajuste de conteo inicial. Los que dejes vacíos no cambian.
      </p>

      <SkeletonList
        v-if="status === 'pending' && !products"
        trailing
      />

      <UEmpty
        v-else-if="!products?.length"
        icon="i-lucide-boxes"
        title="Todavía no hay productos"
        description="Cargá los productos antes de contar su stock."
        variant="naked"
      />

      <UForm
        v-else
        id="conteo-inicial-form"
        ref="form"
        :schema="initialCountFormSchema"
        :state="state"
        @submit="onSubmit"
        @error="onError"
      >
        <section aria-label="Productos a contar">
          <UEmpty
            v-if="!shown.length"
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
              v-for="product in shown"
              :key="product.id"
              class="flex items-start justify-between gap-3 py-2"
            >
              <span class="flex min-w-0 flex-col pt-1">
                <span class="truncate font-medium text-highlighted">{{ product.name }}</span>
                <span class="truncate text-sm text-muted tabular-nums">{{ product.code }} · Físico {{ formatUnits(product.stock.onHand) }}</span>
              </span>
              <UFormField
                :name="`counts.${product.id}`"
                eager-validation
                class="w-28 shrink-0"
              >
                <UInput
                  v-model="state.counts[product.id]"
                  :aria-label="`Contado de ${product.name}`"
                  inputmode="numeric"
                  autocomplete="off"
                  enterkeyhint="next"
                  placeholder="Contado"
                  class="w-full"
                />
              </UFormField>
            </li>
          </ul>
        </section>
      </UForm>
    </template>

    <template #footer>
      <div class="border-t border-default p-4 sm:px-6">
        <UButton
          type="submit"
          form="conteo-inicial-form"
          :label="typed ? `Guardar conteo (${formatUnits(typed)})` : 'Guardar conteo'"
          icon="i-lucide-check"
          :loading="saving"
          :disabled="!typed"
          block
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
