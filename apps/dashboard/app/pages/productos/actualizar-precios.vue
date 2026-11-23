<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { z } from 'zod'
import { categoryPriceUpdateFormSchema, type CategoryPriceUpdatePlan, type PriceUpdateDirection } from '~/utils/products'

useSeoMeta({ title: 'Actualizar precios' })

type PlanItem = CategoryPriceUpdatePlan['items'][number]

const route = useRoute()
const { request } = useApi()
const toast = useToast()
const { data: categories } = await useCategories()
const form = useTemplateRef('form')

// `?categoria=` comes from the Categories screen, so the Category is already picked.
const state = reactive({
  categoryId: typeof route.query.categoria === 'string' ? route.query.categoria : undefined,
  direction: 'up' as PriceUpdateDirection,
  percent: ''
})

const directionItems: { label: string, value: PriceUpdateDirection }[] = [
  { label: 'Aumento', value: 'up' },
  { label: 'Rebaja', value: 'down' }
]

/**
 * The previewed update. Applying sends this Category and percent, never the live form; the API
 * recomputes from the Prices at that moment, which only differ if one changed in between.
 */
const plan = ref<CategoryPriceUpdatePlan | null>(null)
const applying = ref(false)

// Changing the form after a preview makes it stale: it has to be previewed again before applying.
watch(state, () => {
  plan.value = null
})

const { saving: previewing, onSubmit: onPreview } = useFormSubmit<z.output<typeof categoryPriceUpdateFormSchema>>(form, async (data, formRequest) => {
  plan.value = await formRequest(
    c => c.categories[':id']['price-update'].preview.$post({ param: { id: data.categoryId }, json: { percent: data.percent } })
  )
})

async function onApply() {
  if (!plan.value) return
  const { category, percent } = plan.value
  applying.value = true
  try {
    const applied = await request(c => c.categories[':id']['price-update'].$post({ param: { id: category.id }, json: { percent } }))
    toast.add({
      title: 'Precios actualizados',
      // No count: the API lists every Active Product, also those whose Price didn't change after rounding.
      description: `${changeLabel(applied.percent)} en ${applied.category.name}.`,
      color: 'success',
      icon: 'i-lucide-circle-check'
    })
    await navigateTo({ path: '/productos', query: { categoria: category.id } })
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    applying.value = false
  }
}

/** `"12.50"` → "Aumento del 12,5 %", `"-5.00"` → "Rebaja del 5 %". */
function changeLabel(percent: string) {
  return percent.startsWith('-') ? `Rebaja del ${formatPercent(percent.slice(1))}` : `Aumento del ${formatPercent(percent)}`
}

function productCount(count: number) {
  return count === 1 ? '1 producto' : `${count} productos`
}

const columns: TableColumn<PlanItem>[] = [
  // Names wrap, so on a phone the prices stay on screen instead of scrolling sideways.
  { accessorKey: 'name', header: 'Producto', meta: { class: { td: 'whitespace-normal' } } },
  {
    accessorKey: 'oldPrice',
    header: 'Actual',
    cell: ({ row }) => formatMoney(row.original.oldPrice),
    meta: { class: { th: 'text-right', td: 'text-right tabular-nums' } }
  },
  {
    accessorKey: 'newPrice',
    header: 'Nuevo',
    cell: ({ row }) => formatMoney(row.original.newPrice),
    meta: { class: { th: 'text-right', td: 'text-right font-medium text-highlighted tabular-nums' } }
  }
]
</script>

<template>
  <UDashboardPanel id="actualizar-precios">
    <template #header>
      <UDashboardNavbar title="Actualizar precios">
        <template #leading>
          <UButton
            to="/productos/categorias"
            icon="i-lucide-arrow-left"
            aria-label="Volver a categorías"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex w-full max-w-2xl flex-col gap-6">
        <!--
          Validated on input only, not on blur or change (an input's change fires on blur):
          tapping "Ver vista previa" blurs the field, and an error clearing right then moves the
          button out from under the finger, so the tap is lost. Errors clear as you type instead.
        -->
        <UForm
          ref="form"
          :schema="categoryPriceUpdateFormSchema"
          :state="state"
          :validate-on="['input']"
          :disabled="applying"
          class="flex flex-col gap-4"
          @submit="onPreview"
        >
          <UFormField
            name="categoryId"
            label="Categoría"
            required
          >
            <USelectMenu
              v-model="state.categoryId"
              :items="categories"
              value-key="id"
              label-key="name"
              icon="i-lucide-tag"
              placeholder="Elegí una categoría"
              :search-input="{ placeholder: 'Buscar categoría', autofocus: false }"
              class="w-full"
            />
          </UFormField>

          <URadioGroup
            v-model="state.direction"
            :items="directionItems"
            legend="Cambio"
            orientation="horizontal"
            variant="table"
          />

          <UFormField
            name="percent"
            label="Porcentaje"
            description="El que te pasó el proveedor, por ejemplo 12,5. Solo cambian los productos activos."
            required
          >
            <UInput
              v-model="state.percent"
              inputmode="decimal"
              enterkeyhint="go"
              autocomplete="off"
              trailing-icon="i-lucide-percent"
              class="w-full"
            />
          </UFormField>

          <UButton
            type="submit"
            label="Ver vista previa"
            icon="i-lucide-eye"
            color="neutral"
            variant="subtle"
            :loading="previewing"
            block
          />
        </UForm>

        <section
          v-if="plan"
          aria-labelledby="vista-previa"
          class="flex flex-col gap-4"
        >
          <div>
            <h2
              id="vista-previa"
              class="font-semibold text-highlighted"
            >
              Vista previa
            </h2>
            <p class="text-sm text-muted">
              {{ changeLabel(plan.percent) }} en {{ productCount(plan.items.length) }} de {{ plan.category.name }}.
              Todavía no se guardó nada.
            </p>
          </div>

          <UEmpty
            v-if="!plan.items.length"
            icon="i-lucide-boxes"
            title="No hay productos activos en esta categoría"
            variant="naked"
          />

          <template v-else>
            <UTable
              :data="plan.items"
              :columns="columns"
            />

            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <UButton
                type="button"
                label="Cancelar"
                color="neutral"
                variant="ghost"
                :disabled="applying"
                @click="plan = null"
              />
              <UButton
                type="button"
                :label="`Aplicar a ${productCount(plan.items.length)}`"
                icon="i-lucide-check"
                :loading="applying"
                @click="onApply"
              />
            </div>
          </template>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
