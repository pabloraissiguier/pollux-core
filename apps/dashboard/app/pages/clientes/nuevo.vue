<script setup lang="ts">
import { customerCreateSchema } from '@pollux/contracts'
import type { z } from 'zod'

useSeoMeta({ title: 'Nuevo cliente' })

const form = useTemplateRef('form')

// A name and one Branch are enough; everything else can wait for the Customer's page.
const state = reactive({
  ...customerFormState(),
  branches: [{ address: '', city: '' }]
})
const branch = state.branches[0]!

const { saving, onSubmit } = useFormSubmit<z.output<typeof customerCreateSchema>>(form, async (data, request) => {
  const customer = await request(c => c.customers.$post({ json: data }))
  await navigateTo(`/clientes/${customer.id}`, { replace: true })
})
</script>

<template>
  <UDashboardPanel id="cliente-nuevo">
    <template #header>
      <UDashboardNavbar title="Nuevo cliente">
        <template #leading>
          <UButton
            to="/clientes"
            icon="i-lucide-arrow-left"
            aria-label="Volver a clientes"
            color="neutral"
            variant="ghost"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UForm
        ref="form"
        :schema="customerCreateSchema"
        :state="state"
        class="flex w-full max-w-lg flex-col gap-4"
        @submit="onSubmit"
      >
        <CustomerFields :model-value="state" />

        <USeparator label="Sucursal" />

        <UFormField
          name="branches.0.address"
          label="Dirección"
          required
        >
          <UInput
            v-model="branch.address"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="branches.0.city"
          label="Localidad"
          required
        >
          <UInput
            v-model="branch.city"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <UButton
          type="submit"
          label="Guardar cliente"
          icon="i-lucide-check"
          block
          :loading="saving"
        />
      </UForm>
    </template>
  </UDashboardPanel>
</template>
