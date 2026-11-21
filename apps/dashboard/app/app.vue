<script setup lang="ts">
import { es } from '@nuxt/ui/locale'

useHead({
  meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
  link: [{ rel: 'icon', href: '/favicon.ico' }],
  htmlAttrs: { lang: 'es-AR' }
})

useSeoMeta({
  titleTemplate: title => (title ? `${title} · Pollux` : 'Pollux')
})
</script>

<template>
  <UApp :locale="es">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
