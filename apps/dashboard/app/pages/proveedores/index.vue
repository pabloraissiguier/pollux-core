<script setup lang="ts">
import type { Supplier } from '~/utils/purchases'

useSeoMeta({ title: 'Proveedores' })

const { request } = useApi()

// The search lives in the URL, so a reload or the back button keeps it.
const { search, searched, page, pageSize, paging, sources } = useListQuery({ search: 'q' })

const { data: suppliers, status, refresh } = useLazyAsyncData(
  'proveedores',
  () => request(c => c.suppliers.$get({ query: { q: searched.value || undefined, ...paging.value } })),
  { watch: sources }
)

// One modal for both: `editing` null is "Nuevo proveedor".
const formOpen = ref(false)
const editing = ref<Supplier | null>(null)

function openForm(supplier: Supplier | null) {
  editing.value = supplier
  formOpen.value = true
}

async function onSaved() {
  await Promise.all([refresh(), refreshNuxtData('proveedores-todos')])
}

function supplierSubtitle(supplier: Supplier) {
  return [supplier.cuit, supplier.phone].filter(Boolean).join(' · ')
}
</script>

<template>
  <UDashboardPanel id="proveedores">
    <template #header>
      <UDashboardNavbar title="Proveedores">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-plus"
            label="Nuevo proveedor"
            @click="openForm(null)"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <div
          role="search"
          class="flex w-full py-2"
        >
          <UInput
            v-model="search"
            type="search"
            icon="i-lucide-search"
            :loading="status === 'pending'"
            placeholder="Buscar por nombre o CUIT"
            aria-label="Buscar por nombre o CUIT"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
            enterkeyhint="search"
            class="w-full sm:max-w-sm"
          />
        </div>
      </UDashboardToolbar>
    </template>

    <template #body>
      <SkeletonList
        v-if="status === 'pending' && !suppliers"
      />

      <UEmpty
        v-else-if="!suppliers?.items.length && searched"
        icon="i-lucide-search-x"
        title="No encontramos proveedores"
        description="Probá con otro nombre o CUIT."
        variant="naked"
      />

      <UEmpty
        v-else-if="!suppliers?.items.length"
        icon="i-lucide-truck"
        title="Todavía no hay proveedores"
        description="Registrá a quién le comprás para cargar sus compras."
        variant="naked"
      />

      <template v-else-if="suppliers">
        <UPageList divide>
          <!-- The whole row opens the edit form, so it's an easy target for a thumb. -->
          <ULink
            v-for="supplier in suppliers.items"
            :key="supplier.id"
            class="relative flex w-full items-center justify-between gap-3 py-3 text-start"
            @click="openForm(supplier)"
          >
            <span class="flex min-w-0 flex-col">
              <span class="truncate font-medium text-highlighted">{{ supplier.name }}</span>
              <span
                v-if="supplierSubtitle(supplier)"
                class="truncate text-sm text-muted"
              >{{ supplierSubtitle(supplier) }}</span>
            </span>
            <UIcon
              name="i-lucide-pencil"
              class="size-5 shrink-0 text-dimmed"
            />
          </ULink>
        </UPageList>

        <UPagination
          v-if="suppliers.total > pageSize"
          v-model:page="page"
          :total="suppliers.total"
          :items-per-page="pageSize"
          class="self-center"
        />
      </template>

      <SupplierFormModal
        v-model:open="formOpen"
        :supplier="editing"
        @saved="onSaved"
      />
    </template>
  </UDashboardPanel>
</template>
