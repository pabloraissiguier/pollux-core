<script setup lang="ts">
import type { z } from 'zod'
import { productCreateFormSchema } from '~/utils/products'

useSeoMeta({ title: 'Nuevo producto' })

const form = useTemplateRef('form')

const state = ref(productFormState())

const { saving, onSubmit } = useFormSubmit<z.output<typeof productCreateFormSchema>>(form, async (data, request) => {
  const product = await request(c => c.products.$post({ json: data }))
  await navigateTo(`/productos/${product.id}`, { replace: true })
})
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
