<script setup lang="ts">
// Temporary page body for sections that aren't built yet.
const props = defineProps<{
  title: string
  icon: string
  description: string
}>()

useSeoMeta({ title: props.title })
</script>

<template>
  <UDashboardPanel :id="title">
    <template #header>
      <UDashboardNavbar :title="title">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UEmpty
        :icon="icon"
        :title="title"
        :description="description"
        variant="naked"
        class="my-auto"
      />
    </template>
  </UDashboardPanel>
</template>
