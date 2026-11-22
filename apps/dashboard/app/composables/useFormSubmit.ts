import type { FormSubmitEvent } from '@nuxt/ui'
import type { MaybeRefOrGetter } from 'vue'

type Request = ReturnType<typeof useApi>['request']

/**
 * The one way a form saves through the API. Returns `onSubmit` for `<UForm @submit>` and `saving`
 * for the submit button's `loading`.
 *
 * - A second submit while the first is in flight is ignored, so two taps never save twice.
 * - `action` gets the validated data and a `request` that puts the API's field errors (400
 *   `validation_error`) on `form`. Pass `{ form: null }` to a call whose field names don't match
 *   the form's, and the errors come back as a toast instead.
 * - An `ApiRequestError` has already been shown to the user by `request`, so it only ends the
 *   submit: the form stays as it was for another try. Catch it inside `action` to react to a
 *   specific error code, and throw it again.
 */
export function useFormSubmit<T>(
  form: MaybeRefOrGetter<FormErrorTarget | null | undefined>,
  action: (data: T, request: Request) => Promise<unknown>
) {
  const { request } = useApi()
  const saving = ref(false)

  const formRequest: Request = (call, options = {}) => request(call, { form: toValue(form), ...options })

  async function onSubmit(event: FormSubmitEvent<T>) {
    if (saving.value) return
    saving.value = true
    try {
      await action(event.data, formRequest)
    } catch (error) {
      if (!(error instanceof ApiRequestError)) throw error
    } finally {
      saving.value = false
    }
  }

  return { saving: readonly(saving), onSubmit }
}
