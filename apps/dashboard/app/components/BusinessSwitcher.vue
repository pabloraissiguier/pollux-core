<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const { businesses, activeBusiness, activeBusinessId, selectBusiness } = useActiveBusiness()

async function switchTo(id: string) {
  if (id === activeBusinessId.value) return
  selectBusiness(id)
  // A page of one business (a customer, an order) means nothing in another: start over at Inicio.
  await navigateTo('/')
  await refreshNuxtData()
}

const items = computed<DropdownMenuItem[]>(() => (businesses.value ?? []).map(business => ({
  label: business.name,
  type: 'checkbox' as const,
  checked: business.id === activeBusinessId.value,
  onSelect: () => switchTo(business.id)
})))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start', collisionPadding: 12 }"
  >
    <UButton
      :label="collapsed ? undefined : activeBusiness?.name"
      :aria-label="`Negocio: ${activeBusiness?.name ?? 'sin elegir'}. Cambiar de negocio`"
      icon="i-lucide-building-2"
      :trailing-icon="collapsed ? undefined : 'i-lucide-chevrons-up-down'"
      color="neutral"
      variant="ghost"
      :square="collapsed"
      block
      class="data-[state=open]:bg-elevated"
    />
  </UDropdownMenu>
</template>
