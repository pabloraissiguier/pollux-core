<script setup lang="ts">
import type { FormErrorEvent } from '@nuxt/ui'
import type { z } from 'zod'
import type { Product } from '~/utils/products'
import { purchaseFormSchema, purchaseFormTotal, purchaseLineSubtotal } from '~/utils/purchases'

useSeoMeta({ title: 'Nueva compra' })

const SEARCH_DELAY_MS = 250
const RESULT_LIMIT = 30

const { request } = useApi()
const toast = useToast()
const { data: suppliers } = useSuppliers()
const form = useTemplateRef('form')

const state = reactive(purchaseFormState())
const total = computed(() => purchaseFormTotal(state.lines))

// Product search: the API searches name, Code and Brand. Inactive Products may be bought too.
const productSearch = ref('')
const searchedText = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(productSearch, (value) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchedText.value = value.trim()
  }, SEARCH_DELAY_MS)
})
onBeforeUnmount(() => clearTimeout(searchTimer))

const { data: products, status: productsStatus } = useLazyAsyncData(
  'compra-productos',
  async () => searchedText.value
    ? (await request(c => c.products.$get({ query: { q: searchedText.value, limit: String(RESULT_LIMIT) } }))).items
    : [],
  { watch: [searchedText], default: () => [] }
)
const productItems = computed(() => products.value.map(product => ({
  ...product,
  label: product.name,
  description: product.isActive ? product.code : `${product.code} · Inactivo`
})))

// The picker only adds lines: it goes back to empty after each pick, ready for the next one.
// It holds null, not undefined: with undefined the menu keeps its own copy of the pick and shows it.
type ProductItem = (typeof productItems.value)[number]
const picked = ref<ProductItem | null>(null)
const pickedModel = computed({
  get: () => picked.value as ProductItem | undefined,
  set: (product) => {
    picked.value = product ?? null
  }
})
watch(picked, (product) => {
  if (!product) return
  picked.value = null
  addLine(product)
})

let nextKey = 0
async function addLine(product: Product) {
  const key = nextKey++
  state.lines.push({ key, product: { id: product.id, code: product.code, name: product.name }, quantity: '', unitCost: '' })
  productSearch.value = ''
  form.value?.clear('lines')
  // Straight to the new line's quantity, so the keypad opens where the typing goes.
  await nextTick()
  document.getElementById(`compra-linea-${key}-cantidad`)?.focus()
}

function removeLine(index: number) {
  state.lines.splice(index, 1)
}

// Two taps (or Enter while saving) must not register the Purchase twice.
const { saving, onSubmit } = useFormSubmit<z.output<typeof purchaseFormSchema>>(form, async (data, formRequest) => {
  const purchase = await formRequest(c => c.purchases.$post({ json: data }))
  toast.add({
    title: 'Compra registrada',
    description: `${purchase.supplier.name} · ${formatMoney(purchase.total)}`,
    color: 'success',
    icon: 'i-lucide-check'
  })
  await navigateTo(`/compras/${purchase.id}`, { replace: true })
})

function onError(event: FormErrorEvent) {
  const id = event.errors[0]?.id
  if (id) document.getElementById(id)?.focus()
}
</script>

<template>
  <UDashboardPanel id="compra-nueva">
    <template #header>
      <UDashboardNavbar title="Nueva compra">
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
      <UForm
        id="compra-form"
        ref="form"
        :schema="purchaseFormSchema"
        :state="state"
        class="flex w-full max-w-2xl flex-col gap-4"
        @submit="onSubmit"
        @error="onError"
      >
        <UFormField
          name="supplierId"
          label="Proveedor"
          required
        >
          <USelectMenu
            v-model="state.supplierId"
            :items="suppliers"
            value-key="id"
            label-key="name"
            placeholder="Elegí un proveedor"
            :search-input="{ placeholder: 'Buscar proveedor' }"
            class="w-full"
          >
            <template #empty>
              <span class="text-sm text-muted">No hay proveedores.</span>
              <ULink
                to="/proveedores"
                class="text-sm text-primary"
              >
                Cargá uno en Proveedores
              </ULink>
            </template>
          </USelectMenu>
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="purchasedOn"
            label="Fecha"
            required
          >
            <UInput
              v-model="state.purchasedOn"
              type="date"
              :max="todayInArgentina()"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="invoiceNumber"
            label="Número de factura"
            hint="Opcional"
          >
            <UInput
              v-model="state.invoiceNumber"
              autocomplete="off"
              autocapitalize="characters"
              autocorrect="off"
              spellcheck="false"
              class="w-full"
            />
          </UFormField>
        </div>

        <section
          aria-labelledby="compra-productos"
          class="flex flex-col gap-3"
        >
          <h2
            id="compra-productos"
            class="font-semibold text-highlighted"
          >
            Productos
          </h2>

          <fieldset
            v-for="(line, index) in state.lines"
            :key="line.key"
            class="flex flex-col gap-2 rounded-md border border-default p-3"
          >
            <legend class="sr-only">
              {{ line.product.name }}
            </legend>
            <div
              class="flex items-start justify-between gap-2"
              aria-hidden="true"
            >
              <span class="flex min-w-0 flex-col">
                <span class="truncate font-medium text-highlighted">{{ line.product.name }}</span>
                <span class="truncate text-sm text-muted">{{ line.product.code }}</span>
              </span>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <UFormField
                :name="`lines.${index}.quantity`"
                label="Cantidad"
              >
                <UInput
                  :id="`compra-linea-${line.key}-cantidad`"
                  v-model="line.quantity"
                  inputmode="numeric"
                  autocomplete="off"
                  enterkeyhint="next"
                  class="w-full"
                />
              </UFormField>
              <UFormField
                :name="`lines.${index}.unitCost`"
                label="Costo unitario"
              >
                <UInput
                  v-model="line.unitCost"
                  inputmode="decimal"
                  autocomplete="off"
                  enterkeyhint="next"
                  class="w-full"
                >
                  <template #leading>
                    <span class="text-muted">$</span>
                  </template>
                </UInput>
              </UFormField>
            </div>
            <div class="flex items-center justify-between gap-2">
              <span class="text-sm text-muted tabular-nums">
                Subtotal {{ purchaseLineSubtotal(line) ? formatMoney(purchaseLineSubtotal(line)!) : '—' }}
              </span>
              <UButton
                icon="i-lucide-trash-2"
                :aria-label="`Quitar ${line.product.name}`"
                color="neutral"
                variant="ghost"
                @click="removeLine(index)"
              />
            </div>
          </fieldset>

          <UFormField name="lines">
            <USelectMenu
              v-model="pickedModel"
              v-model:search-term="productSearch"
              :items="productItems"
              ignore-filter
              :loading="productsStatus === 'pending'"
              icon="i-lucide-plus"
              placeholder="Agregar producto"
              aria-label="Agregar producto"
              :search-input="{ placeholder: 'Buscar producto' }"
              class="w-full"
            >
              <template #empty>
                {{ productSearch.trim() ? 'No encontramos productos' : 'Escribí el nombre, código o marca' }}
              </template>
            </USelectMenu>
          </UFormField>
        </section>

        <UFormField
          name="notes"
          label="Notas"
          hint="Opcional"
        >
          <UTextarea
            v-model="state.notes"
            autoresize
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex items-center justify-between gap-4 border-t border-default p-4 sm:px-6">
        <span class="flex flex-col">
          <span
            id="compra-total-label"
            class="text-sm text-muted"
          >Total</span>
          <output
            role="status"
            aria-labelledby="compra-total-label"
            class="text-lg font-semibold text-highlighted tabular-nums"
          >{{ formatMoney(total) }}</output>
        </span>
        <UButton
          type="submit"
          form="compra-form"
          label="Registrar compra"
          icon="i-lucide-check"
          :loading="saving"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
