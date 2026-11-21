<script setup lang="ts">
definePageMeta({ layout: false })
useSeoMeta({ title: 'Elegí un negocio' })

const route = useRoute()
const { businesses, activeBusinessId, selectBusiness, loadBusinesses } = useActiveBusiness()
const { signOut } = useSignOut()

// Always fresh: the picker is where a stale or revoked choice ends up.
const { status } = await useAsyncData('negocio-businesses', async () => {
  if (await loadBusinesses() && businesses.value?.length === 1) {
    await navigateTo(safeRedirect(route.query.redirect), { replace: true })
  }
  return true
})

async function choose(id: string) {
  selectBusiness(id)
  await navigateTo(safeRedirect(route.query.redirect), { replace: true })
}
</script>

<template>
  <div class="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
    <UPageCard
      class="w-full max-w-sm"
      title="Elegí un negocio"
      description="Podés cambiarlo después desde el menú."
      icon="i-lucide-building-2"
    >
      <USkeleton
        v-if="status === 'pending'"
        class="h-24 w-full"
      />

      <UEmpty
        v-else-if="!businesses?.length"
        icon="i-lucide-building"
        title="Tu usuario no pertenece a ningún negocio"
        description="Pedile al dueño del negocio que te agregue."
        variant="naked"
      />

      <div
        v-else
        class="flex flex-col gap-2"
      >
        <UButton
          v-for="business in businesses"
          :key="business.id"
          :label="business.name"
          :trailing-icon="business.id === activeBusinessId ? 'i-lucide-check' : 'i-lucide-chevron-right'"
          color="neutral"
          variant="outline"
          size="xl"
          block
          class="justify-between"
          @click="choose(business.id)"
        />
      </div>

      <UButton
        label="Cerrar sesión"
        icon="i-lucide-log-out"
        color="neutral"
        variant="ghost"
        block
        @click="signOut"
      />
    </UPageCard>
  </div>
</template>
