<script setup lang="ts">
import type { FormSubmitEvent } from '@nuxt/ui'
import type { z } from 'zod'
import { productCreateFormSchema } from '~/utils/products'

useSeoMeta({ title: 'Nuevo producto' })

const route = useRoute()
const { request } = useApi()
const form = useTemplateRef('form')

// Coming from a Category's list (`?categoria=`), the new Product starts in that Category.
const state = ref({
  ...productFormState(),
  categoryId: typeof route.query.categoria === 'string' ? route.query.categoria : undefined
})
const saving = ref(false)

async function onSubmit({ data }: FormSubmitEvent<z.output<typeof productCreateFormSchema>>) {
  saving.value = true
  try {
    const product = await request(c => c.products.$post({ json: data }), { form: form.value })
    await navigateTo(`/productos/${product.id}`, { replace: true })
  } catch (error) {
    if (!(error instanceof ApiRequestError)) throw error
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="producto-nuevo">
    <template #header>
      <UDashboardNavbar title="Nuevo producto">
        <template #leading>
          <UButton
            to="/productos"
            icon="i-lucide-arrow-left"
            aria-label="Volver a productos"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UForm
        ref="form"
        :schema="productCreateFormSchema"
        :state="state"
        class="flex w-full max-w-lg flex-col gap-4"
        @submit="onSubmit"
      >
        <ProductFields
          v-model="state"
          with-price
        />

        <UButton
          type="submit"
          label="Crear producto"
          icon="i-lucide-check"
          :loading="saving"
          block
        />
      </UForm>
    </template>
  </UDashboardPanel>
</template>
