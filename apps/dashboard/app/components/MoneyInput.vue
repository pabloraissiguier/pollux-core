<script setup lang="ts">
/**
 * A `UInput` for an amount, formatted the es-AR way as it's typed: `1.234.567,89`
 * (`formatMoneyInput`). The caret stays after the same digit when the dots move. Every other
 * attribute and slot goes to `UInput`; read the value with `parseDecimalInput`, as before.
 */
defineOptions({ inheritAttrs: false })

const model = defineModel<string>({ required: true })
const field = useTemplateRef<{ inputRef: HTMLInputElement | null }>('field')

/** How many digits and commas sit before `end`: what the caret is after, whatever the dots. */
function significantBefore(text: string, end: number): number {
  return text.slice(0, end).replace(/[^\d,]/g, '').length + (text.slice(0, end).endsWith('.') && !text.includes(',') ? 1 : 0)
}

function caretAt(text: string, significant: number): number {
  if (significant === 0) return 0
  let seen = 0
  for (let i = 0; i < text.length; i++) {
    if (/[\d,]/.test(text[i]!)) seen++
    if (seen === significant) return i + 1
  }
  return text.length
}

function onUpdate(value: unknown) {
  const raw = String(value ?? '')
  const formatted = formatMoneyInput(raw)
  model.value = formatted
  const el = field.value?.inputRef
  if (!el || el.value === formatted) return
  const caret = significantBefore(raw, el.selectionStart ?? raw.length)
  el.value = formatted
  if (document.activeElement === el) {
    const at = caretAt(formatted, caret)
    el.setSelectionRange(at, at)
  }
}
</script>

<template>
  <UInput
    ref="field"
    v-bind="$attrs"
    :model-value="model"
    inputmode="decimal"
    autocomplete="off"
    @update:model-value="onUpdate"
  >
    <template
      v-for="(_, name) in $slots"
      #[name]="slotProps"
    >
      <slot
        :name="name"
        v-bind="slotProps ?? {}"
      />
    </template>
  </UInput>
</template>
