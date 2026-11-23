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

// Every form validates a field only as it's typed in, never on blur. Tapping a submit button blurs
// the field first: validating then would clear (or add) an error message, shift the button and
// lose the tap. See "Form validation" in CLAUDE.md.
const themeProps = { form: { validateOn: ['input' as const] } }
</script>

<template>
  <UTheme :props="themeProps">
    <UApp :locale="es">
      <NuxtLayout>
        <NuxtPage />
      </NuxtLayout>
    </UApp>
  </UTheme>
</template>
