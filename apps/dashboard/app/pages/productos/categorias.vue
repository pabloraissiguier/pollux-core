<script setup lang="ts">
import type { Category } from '~/utils/products'

useSeoMeta({ title: 'Categorías' })

const { data: categories, status, refresh } = await useCategories()

const formOpen = ref(false)
const renaming = ref<Category | null>(null)

function openCreate() {
  renaming.value = null
  formOpen.value = true
}

function openRename(category: Category) {
  renaming.value = category
  formOpen.value = true
}

// Renaming changes the order (they're sorted by name) and the Products' Category labels.
async function onSaved() {
  await Promise.all([refresh(), refreshNuxtData('productos')])
}
</script>

<template>
  <UDashboardPanel id="categorias">
    <template #header>
      <UDashboardNavbar title="Categorías">
        <template #leading>
          <UButton
            to="/productos"
            icon="i-lucide-arrow-left"
            aria-label="Volver a productos"
            color="neutral"
            variant="ghost"
          />
        </template>

        <template #right>
          <UButton
            to="/productos/actualizar-precios"
            icon="i-lucide-percent"
            aria-label="Actualizar precios"
            color="neutral"
            variant="ghost"
          />
          <UButton
            icon="i-lucide-plus"
            label="Nueva categoría"
            @click="openCreate"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <USkeleton
        v-if="status === 'pending' && !categories.length"
        class="h-32 w-full"
      />

      <UEmpty
        v-else-if="!categories.length"
        icon="i-lucide-tags"
        title="Todavía no hay categorías"
        description="Agrupá los productos para encontrarlos rápido y actualizar sus precios juntos."
        variant="naked"
      />

      <UPageList
        v-else
        divide
        class="w-full max-w-2xl"
      >
        <div
          v-for="category in categories"
          :key="category.id"
          class="relative flex items-center gap-2 py-1"
        >
          <!-- Opens the catalog filtered by this Category. -->
          <ULink
            :to="{ path: '/productos', query: { categoria: category.id } }"
            class="flex min-w-0 flex-1 items-center justify-between gap-3 py-2"
          >
            <span class="truncate font-medium text-highlighted">{{ category.name }}</span>
            <UIcon
              name="i-lucide-chevron-right"
              class="size-5 shrink-0 text-dimmed"
            />
          </ULink>
          <UButton
            :to="{ path: '/productos/actualizar-precios', query: { categoria: category.id } }"
            icon="i-lucide-percent"
            :aria-label="`Actualizar precios de ${category.name}`"
            color="neutral"
            variant="ghost"
          />
          <UButton
            icon="i-lucide-pencil"
            :aria-label="`Renombrar ${category.name}`"
            color="neutral"
            variant="ghost"
            @click="openRename(category)"
          />
        </div>
      </UPageList>

      <ProductCategoryFormModal
        v-model:open="formOpen"
        :category="renaming"
        @saved="onSaved"
      />
    </template>
  </UDashboardPanel>
</template>
