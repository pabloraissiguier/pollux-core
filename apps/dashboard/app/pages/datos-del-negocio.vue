<script setup lang="ts">
import { VAT_CONDITIONS } from '@pollux/contracts'

/**
 * Datos del negocio: the business's own data, printed as the issuer on every Delivery note. The
 * form sends every field, so one left blank is cleared; only the name is required.
 */
useSeoMeta({ title: 'Datos del negocio' })

const toast = useToast()
const { request } = useApi()
const { renameActiveBusiness } = useActiveBusiness()

const { data: business, status } = await useAsyncData('datos-del-negocio', () => request(c => c.business.$get()))

const form = useTemplateRef('form')
const state = reactive(businessFormState())
watch(business, value => Object.assign(state, businessFormState(value)), { immediate: true })

// "Sin especificar" is a choice of its own (value null), so the condition can be cleared.
const vatConditions = [
  { value: null, label: 'Sin especificar' },
  ...VAT_CONDITIONS.map(value => ({ value, label: vatConditionLabels[value] }))
]

const { saving, onSubmit } = useFormSubmit<BusinessFormOutput>(form, async (data, request) => {
  business.value = await request(c => c.business.$patch({ json: data }))
  // The sidebar shows the business by name.
  renameActiveBusiness(business.value.name)
  toast.add({ title: 'Datos del negocio guardados', color: 'success', icon: 'i-lucide-check' })
})
</script>

<template>
  <UDashboardPanel id="datos-del-negocio">
    <template #header>
      <UDashboardNavbar title="Datos del negocio">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <USkeleton
        v-if="status === 'pending' && !business"
        class="h-96 w-full max-w-xl"
      />

      <UForm
        v-else-if="business"
        id="business-form"
        ref="form"
        :schema="businessFormSchema"
        :state="state"
        class="flex w-full max-w-xl flex-col gap-4"
        @submit="onSubmit"
      >
        <p class="text-sm text-muted">
          Se imprimen como emisor en cada remito. Solo el nombre es obligatorio; un dato que dejes vacío no se imprime.
        </p>

        <UFormField
          name="name"
          label="Nombre"
          help="Cómo aparece el negocio en la app. En el remito va la razón social, si la cargás."
          required
        >
          <UInput
            v-model="state.name"
            autocomplete="organization"
            class="w-full"
          />
        </UFormField>

        <UFormField
          name="legalName"
          label="Razón social"
          hint="Opcional"
        >
          <UInput
            v-model="state.legalName"
            autocomplete="off"
            class="w-full"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField
            name="cuit"
            label="CUIT"
            hint="Opcional"
          >
            <UInput
              :model-value="state.cuit"
              inputmode="numeric"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              placeholder="XX-XXXXXXXX-X"
              class="w-full"
              @update:model-value="value => state.cuit = maskCuit(String(value ?? ''))"
            />
          </UFormField>

          <UFormField
            name="vatCondition"
            label="Condición frente al IVA"
            hint="Opcional"
          >
            <USelectMenu
              v-model="state.vatCondition"
              :items="vatConditions"
              value-key="value"
              :search-input="false"
              placeholder="Sin especificar"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="grossIncomeNumber"
            label="Ingresos Brutos"
            hint="Opcional"
          >
            <UInput
              v-model="state.grossIncomeNumber"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="activityStartDate"
            label="Inicio de actividades"
            hint="Opcional"
          >
            <UInput
              v-model="state.activityStartDate"
              type="date"
              :max="todayInArgentina()"
              class="w-full"
            />
          </UFormField>
        </div>

        <h2 class="mt-2 font-semibold text-highlighted">
          Domicilio
        </h2>

        <UFormField
          name="address"
          label="Dirección"
          hint="Opcional"
        >
          <UInput
            v-model="state.address"
            autocomplete="address-line1"
            class="w-full"
          />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-3">
          <UFormField
            name="city"
            label="Localidad"
            hint="Opcional"
          >
            <UInput
              v-model="state.city"
              autocomplete="address-level2"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="province"
            label="Provincia"
            hint="Opcional"
          >
            <UInput
              v-model="state.province"
              autocomplete="address-level1"
              class="w-full"
            />
          </UFormField>

          <UFormField
            name="postalCode"
            label="Código postal"
            hint="Opcional"
          >
            <UInput
              v-model="state.postalCode"
              autocomplete="postal-code"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField
          name="phone"
          label="Teléfono"
          hint="Opcional"
        >
          <UInput
            v-model="state.phone"
            type="tel"
            autocomplete="tel"
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>

    <template
      v-if="business"
      #footer
    >
      <div class="flex justify-end border-t border-default p-4">
        <UButton
          type="submit"
          form="business-form"
          label="Guardar cambios"
          icon="i-lucide-check"
          :loading="saving"
          class="w-full justify-center sm:w-auto"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
