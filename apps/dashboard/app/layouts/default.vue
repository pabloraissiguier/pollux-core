<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)

const links: NavigationMenuItem[] = [
  { label: 'Inicio', icon: 'i-lucide-house', to: '/', onSelect: () => { open.value = false } },
  { label: 'Pedidos', icon: 'i-lucide-clipboard-list', to: '/pedidos', onSelect: () => { open.value = false } },
  { label: 'Clientes', icon: 'i-lucide-users', to: '/clientes', onSelect: () => { open.value = false } },
  { label: 'Cuentas corrientes', icon: 'i-lucide-wallet', to: '/cuentas-corrientes', onSelect: () => { open.value = false } },
  { label: 'Productos', icon: 'i-lucide-boxes', to: '/productos', onSelect: () => { open.value = false } }
]
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <AppLogo
          :collapsed="collapsed"
          class="px-1"
        />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <UColorModeButton :class="collapsed ? '' : 'ms-auto'" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
