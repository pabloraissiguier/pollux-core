<script setup lang="ts">
import * as z from 'zod'
import type { AuthFormField, FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: false })
useSeoMeta({ title: 'Ingresar' })

const auth = useAuth()
const route = useRoute()

const fields: AuthFormField[] = [{
  name: 'email',
  type: 'email',
  label: 'Email',
  placeholder: 'tu@email.com',
  autocomplete: 'username',
  required: true
}, {
  name: 'password',
  type: 'password',
  label: 'Contraseña',
  autocomplete: 'current-password',
  enterKeyHint: 'go',
  required: true
}]

const schema = z.object({
  email: z.email('Ingresá un email válido'),
  password: z.string('Ingresá tu contraseña').min(1, 'Ingresá tu contraseña')
})

const error = ref<string | null>(null)
const loading = ref(false)

async function onSubmit({ data }: FormSubmitEvent<z.output<typeof schema>>) {
  error.value = null
  loading.value = true
  try {
    await auth.signIn(data.email, data.password)
    await navigateTo(safeRedirect(route.query.redirect), { replace: true })
  } catch (e) {
    error.value = e instanceof SignInError ? e.message : 'No pudimos iniciar sesión. Probá de nuevo.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
    <UPageCard class="w-full max-w-sm">
      <UAuthForm
        :schema="schema"
        :fields="fields"
        :loading="loading"
        :submit="{ label: 'Ingresar' }"
        title="Pollux"
        description="Ingresá con tu email y contraseña."
        icon="i-lucide-lock"
        @submit="onSubmit"
      >
        <template
          v-if="error || auth.testMode"
          #validation
        >
          <UAlert
            v-if="error"
            color="error"
            icon="i-lucide-circle-alert"
            :title="error"
          />
          <UAlert
            v-else
            color="warning"
            variant="subtle"
            icon="i-lucide-flask-conical"
            title="Modo de prueba"
            description="La contraseña es el id del usuario."
          />
        </template>
      </UAuthForm>
    </UPageCard>
  </div>
</template>
