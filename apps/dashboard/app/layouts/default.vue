<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const open = ref(false)
const { activeBusiness, hasSeveral } = useActiveBusiness()
const { signOut } = useSignOut()

const links: NavigationMenuItem[] = [
  { label: 'Inicio', icon: 'i-lucide-house', to: '/', onSelect: () => { open.value = false } },
  { label: 'Pedidos', icon: 'i-lucide-clipboard-list', to: '/pedidos', onSelect: () => { open.value = false } },
  { label: 'Clientes', icon: 'i-lucide-users', to: '/clientes', onSelect: () => { open.value = false } },
  { label: 'Cuentas corrientes', icon: 'i-lucide-wallet', to: '/cuentas-corrientes', onSelect: () => { open.value = false } },
  { label: 'Productos', icon: 'i-lucide-boxes', to: '/productos', onSelect: () => { open.value = false } },
  { label: 'Compras', icon: 'i-lucide-package-plus', to: '/compras', onSelect: () => { open.value = false } },
  { label: 'Proveedores', icon: 'i-lucide-truck', to: '/proveedores', onSelect: () => { open.value = false } }
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
        <BusinessSwitcher
          v-if="hasSeveral"
          :collapsed="collapsed"
        />
        <UUser
          v-else-if="activeBusiness && !collapsed"
          :name="activeBusiness.name"
          :avatar="{ icon: 'i-lucide-building-2' }"
          size="sm"
          class="px-2.5"
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links"
          orientation="vertical"
          tooltip
        />
      </template>

      <template #footer="{ collapsed }">
        <UButton
          :label="collapsed ? undefined : 'Cerrar sesión'"
          aria-label="Cerrar sesión"
          icon="i-lucide-log-out"
          color="neutral"
          variant="ghost"
          :square="collapsed"
          @click="signOut"
        />
        <UColorModeButton :class="collapsed ? '' : 'ms-auto'" />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
