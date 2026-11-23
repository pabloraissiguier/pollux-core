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

// Forms validate as fields are typed in, never on blur: see "Form validation" in CLAUDE.md.
const componentDefaults = { form: { validateOn: ['input' as const] } }
</script>

<template>
  <UTheme :props="componentDefaults">
    <UApp :locale="es">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UApp>
  </UTheme>
</template>
