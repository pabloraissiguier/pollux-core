<script setup lang="ts">
import type { ButtonProps, FormErrorEvent, StepperItem } from '@nuxt/ui'
import type { CustomerOption } from '~/utils/customers'
import type { OrderDraft, OrderFormStep } from '~/composables/useOrderDraft'
import type { Order, OrderFormOutput, OrderFormState, SavedOrder } from '~/utils/orders'
import type { Product } from '~/utils/products'

/**
 * The Order screen for taking and editing an Order: Customer and Branch, the lines with quantity
 * steppers and Discounts, the Product picker, then the Delivery date, the Order Discount and notes,
 * and a footer that keeps the live total and Save in reach.
 *
 * On a wide screen it is one page, with the picker beside the lines. On a phone it is three steps
 * (Cliente, Productos, Confirmar), with the steps and the total fixed in the footer and the picked
 * Customer in a toolbar under the navbar. Moving forward checks the steps it leaves behind.
 *
 * With `order`, it edits that Pending Order: its Customer is fixed (`customer` gives its Branches)
 * and its lines keep their frozen prices. Without one, the Order being taken is kept on the device
 * (`useOrderDraft`) until it's saved or discarded ("Empezar de nuevo", which emits `discarded`).
 */
const props = defineProps<{ order?: Order, customer?: CustomerOption, available?: Record<string, number> }>()
const emit = defineEmits<{ saved: [order: SavedOrder], discarded: [] }>()

const form = useTemplateRef('form')

// A new Order picks up where the owner left it on this device.
const draft = props.order ? null : useOrderDraft()
const restored = draft?.read() ?? null

const state = reactive<OrderFormState>(props.order
  ? orderFormStateFrom(props.order, props.available)
  : restored?.state ?? { customerId: undefined, branchId: undefined, deliveryDate: tomorrowInArgentina(), discountPercent: '', notes: '', lines: [] })

const customer = ref<CustomerOption | undefined>(props.customer ?? restored?.customer ?? undefined)
// A Customer with a single Branch has it picked on their behalf.
watch(customer, (picked) => {
  state.customerId = picked?.id
  state.branchId = picked?.branches.length === 1 ? picked.branches[0]!.id : undefined
  // With one Branch there is nothing left to ask: on to the Products.
  if (state.branchId && step.value === 'cliente') goTo('productos')
})
const branches = computed(() => customer.value?.branches ?? [])
const branchItems = computed(() => branches.value.map(b => ({ value: b.id, label: branchLabel(b) })))

const totals = computed(() => orderFormTotals(state))
const inOrder = computed(() => Object.fromEntries(state.lines.map(l => [l.productId, l.quantity])))
const units = computed(() => state.lines.reduce((sum, l) => sum + typedQuantity(l.quantity), 0))

/** Adds one unit of the Product: a new line at its current Price, or one more on its line. */
function addProduct(product: Product) {
  const line = state.lines.find(l => l.productId === product.id)
  if (line) {
    line.quantity = typedQuantity(line.quantity) + 1
    // Available stock now known; it already counts what this Order reserved.
    line.available = product.stock.available
    return
  }
  state.lines.push({
    productId: product.id,
    product: { id: product.id, code: product.code, name: product.name },
    unitPrice: product.price,
    quantity: 1,
    reservedByOrder: 0,
    available: product.stock.available,
    discountPercent: ''
  })
}

type Step = OrderFormStep
const STEPS: Step[] = ['cliente', 'productos', 'confirmar']
const stepItems: StepperItem[] = [
  { value: 'cliente', title: 'Cliente', icon: 'i-lucide-user' },
  { value: 'productos', title: 'Productos', icon: 'i-lucide-package' },
  { value: 'confirmar', title: 'Confirmar', icon: 'i-lucide-check' }
]

const wide = useWideScreen()
// An edit already has its Customer, so it starts at the lines.
const step = ref<Step>(props.order ? 'productos' : restored?.step ?? 'cliente')
const stepIndex = computed(() => STEPS.indexOf(step.value))
const nextStep = computed(() => STEPS[stepIndex.value + 1])
const previousStep = computed(() => STEPS[stepIndex.value - 1])
/** Whether a step's part of the form is on screen: all of them on a wide screen. */
const shows = (part: Step) => wide.value || step.value === part

/** The fields each step asks for, as the form names them. */
function stepFields(part: Step): string[] {
  if (part === 'cliente') return ['customerId', 'branchId']
  if (part === 'productos') {
    return ['lines', ...state.lines.flatMap((_, i) => [`lines.${i}.quantity`, `lines.${i}.discountPercent`])]
  }
  return ['deliveryDate', 'discountPercent', 'notes']
}

function stepOf(field: string): Step {
  if (field === 'customerId' || field === 'branchId') return 'cliente'
  return field.startsWith('lines') ? 'productos' : 'confirmar'
}

/** Goes to a step. Going forward checks every step on the way and stops at the first one that fails. */
async function goTo(target: Step) {
  for (const part of STEPS.slice(stepIndex.value, STEPS.indexOf(target))) {
    // The field names are dynamic (`lines.0.quantity`), which the form's typed names don't cover.
    const valid = await form.value?.validate({ name: stepFields(part) as never, silent: true })
    if (!valid) {
      step.value = part
      return
    }
  }
  step.value = target
}

function goToStep(value: string | number | undefined) {
  if (STEPS.includes(value as Step)) goTo(value as Step)
}

// A new step starts at its top.
watch(step, () => {
  if (wide.value) return
  nextTick(() => document.getElementById('order-form')?.scrollIntoView({ block: 'start' }))
})

/** Shows the earliest step holding one of these errors, so it never hides on another step. */
function showFirstError(fields: (string | undefined)[]) {
  const steps = fields.filter(f => f !== undefined).map(stepOf)
  const first = STEPS.find(s => steps.includes(s))
  if (first) step.value = first
}

// On a phone the Product picker opens in a slideover over the lines; it closes with its step.
const adding = ref(false)
watch(step, () => {
  adding.value = false
})

const branchText = computed(() => branchItems.value.find(b => b.value === state.branchId)?.label)

/** A stepper button named after its line, so a screen reader says which Product it changes. */
const stepButton = (label: string) => ({ 'aria-label': label }) as ButtonProps

function removeLine(index: number) {
  state.lines.splice(index, 1)
}

// Every change is kept on the device, so leaving by mistake loses nothing.
const currentDraft = (): OrderDraft => ({ state, customer: customer.value ?? null, step: step.value })
const dirty = computed(() => !!draft && draft.hasContent(currentDraft()))
if (draft) watch([() => state, customer, step], () => draft.write(currentDraft()), { deep: true })

const toast = useToast()
onMounted(() => {
  if (restored) toast.add({ title: 'Recuperamos el pedido que estabas cargando', icon: 'i-lucide-history' })
})

// "Empezar de nuevo" asks first: a slip of the finger must not lose the Order.
const discarding = ref(false)
function discard() {
  draft?.clear()
  discarding.value = false
  emit('discarded')
}

// Two taps on Save must not take the Order twice: the second one finds it saving.
const { saving, onSubmit } = useFormSubmit<OrderFormOutput>(form, async (data, request) => {
  const order = props.order
  if (order) {
    const { customerId: _fixed, ...changes } = data
    emit('saved', await request(c => c.orders[':id'].$patch({ param: { id: order.id }, json: changes })))
  } else {
    const saved = await request(c => c.orders.$post({ json: data }))
    draft?.clear()
    emit('saved', saved)
  }
})

/**
 * On a phone, Enter in a field (the keyboard's "Ir") before the last step moves on instead of
 * saving an Order the owner hasn't reviewed. Errors from the API go to the step of their field.
 */
async function submit(event: Parameters<typeof onSubmit>[0]) {
  if (!wide.value && nextStep.value) {
    await goTo(nextStep.value)
    return
  }
  await onSubmit(event)
  showFirstError(form.value?.getErrors().map(e => e.name) ?? [])
}

function onInvalid(event: FormErrorEvent) {
  showFirstError(event.errors.map(e => e.name))
}
</script>

<template>
  <UDashboardPanel id="pedido-form">
    <template #header>
      <UDashboardNavbar :title="order ? `Editar pedido N° ${order.number}` : 'Nuevo pedido'">
        <template #leading>
          <UButton
            :to="order ? `/pedidos/${order.id}` : '/pedidos'"
            icon="i-lucide-arrow-left"
            :aria-label="order ? 'Volver al pedido' : 'Volver a Pedidos'"
            color="neutral"
            variant="ghost"
          />
        </template>

        <template
          v-if="dirty"
          #right
        >
          <UButton
            :label="wide ? 'Empezar de nuevo' : undefined"
            aria-label="Empezar de nuevo"
            icon="i-lucide-rotate-ccw"
            color="neutral"
            variant="ghost"
            @click="discarding = true"
          />
        </template>
      </UDashboardNavbar>

      <!-- On a phone, the picked Customer stays in sight while the Order is filled in. -->
      <UDashboardToolbar
        v-if="!wide && customer && step !== 'cliente'"
        class="py-2"
      >
        <section
          aria-label="Cliente del pedido"
          class="flex min-w-0 flex-1 items-center justify-between gap-3"
        >
          <p class="flex min-w-0 flex-col">
            <span class="truncate font-medium text-highlighted">{{ customer.name }}</span>
            <span
              v-if="branchText"
              class="truncate text-sm text-muted"
            >{{ branchText }}</span>
          </p>
          <UButton
            v-if="!order || branches.length > 1"
            :label="order ? 'Cambiar sucursal' : 'Cambiar'"
            color="neutral"
            variant="outline"
            size="sm"
            @click="goTo('cliente')"
          />
        </section>
      </UDashboardToolbar>
    </template>

    <template #body>
      <UForm
        id="order-form"
        ref="form"
        :schema="orderFormSchema"
        :state="state"
        class="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start lg:gap-6"
        @submit="submit"
        @error="onInvalid"
      >
        <!-- Step 1: Customer and Branch. -->
        <div
          v-if="shows('cliente')"
          class="flex flex-col gap-4"
        >
          <UFormField
            v-if="!order"
            label="Cliente"
            name="customerId"
          >
            <CustomerSearchMenu
              v-model="customer"
              class="w-full"
            />
          </UFormField>
          <p
            v-else
            class="flex flex-col"
          >
            <span class="text-sm text-muted">Cliente</span>
            <span class="font-medium text-highlighted">{{ order.customer.name }}</span>
          </p>

          <template v-if="customer">
            <UFormField
              v-if="branches.length > 1"
              label="Sucursal"
              name="branchId"
            >
              <USelect
                v-model="state.branchId"
                :items="branchItems"
                placeholder="Elegí la sucursal"
                class="w-full"
                @update:model-value="goTo('productos')"
              />
            </UFormField>
            <p
              v-else-if="branches[0]"
              class="flex flex-col"
            >
              <span class="text-sm text-muted">Sucursal</span>
              <span>{{ branchItems[0]!.label }}</span>
            </p>
          </template>
        </div>

        <!-- Step 2: the lines, and the picker beside them on a wide screen. -->
        <section
          v-if="shows('productos')"
          aria-labelledby="productos-del-pedido"
          class="flex flex-col gap-3 lg:col-start-1"
        >
          <div class="flex items-center justify-between gap-3">
            <h2
              id="productos-del-pedido"
              class="font-semibold text-highlighted"
            >
              Productos del pedido
            </h2>
            <UButton
              v-if="!wide"
              label="Agregar"
              icon="i-lucide-plus"
              variant="soft"
              size="md"
              @click="adding = true"
            />
          </div>

          <UFormField name="lines">
            <p
              v-if="!state.lines.length"
              class="text-sm text-muted"
            >
              Todavía no agregaste productos.
            </p>
            <ul
              v-else
              class="divide-y divide-default"
            >
              <li
                v-for="(line, index) in state.lines"
                :key="line.productId"
                class="flex flex-col gap-1.5 py-2.5"
              >
                <!-- Name and subtotal, then the price; the controls fit one row on a phone. -->
                <div class="flex items-start justify-between gap-3">
                  <span class="flex min-w-0 flex-col">
                    <span class="font-medium text-highlighted">{{ line.product.name }}</span>
                    <span class="text-sm text-muted tabular-nums">{{ line.product.code }} · {{ formatMoney(line.unitPrice) }} c/u<template v-if="order"> ({{ line.id ? 'precio del pedido' : 'precio actual' }})</template></span>
                  </span>
                  <span class="shrink-0 font-medium text-highlighted tabular-nums">
                    {{ formatMoney(lineFormSubtotal(line)) }}
                  </span>
                </div>

                <div class="flex items-start gap-2">
                  <UFormField :name="`lines.${index}.quantity`">
                    <UInputNumber
                      v-model="line.quantity"
                      :min="1"
                      :aria-label="`Cantidad de ${line.product.name}`"
                      :increment="stepButton(`Sumar uno a ${line.product.name}`)"
                      :decrement="stepButton(`Restar uno a ${line.product.name}`)"
                      locale="es-AR"
                      size="md"
                      class="w-32"
                    />
                  </UFormField>
                  <UFormField :name="`lines.${index}.discountPercent`">
                    <UInput
                      v-model="line.discountPercent"
                      :aria-label="`Descuento de ${line.product.name}`"
                      placeholder="Desc."
                      inputmode="decimal"
                      autocomplete="off"
                      size="md"
                      class="w-24"
                    >
                      <template #trailing>
                        <span class="text-muted">%</span>
                      </template>
                    </UInput>
                  </UFormField>
                  <UButton
                    icon="i-lucide-trash-2"
                    :aria-label="`Quitar ${line.product.name}`"
                    color="neutral"
                    variant="ghost"
                    size="md"
                    class="ms-auto"
                    @click="removeLine(index)"
                  />
                </div>

                <!-- A warning, never a block: the Order is taken even when stock is short. -->
                <OrderStockWarning
                  v-if="(availableAfter(line) ?? 0) < 0"
                  :available="availableAfter(line)!"
                  projected
                />
              </li>
            </ul>
          </UFormField>
        </section>

        <div
          v-if="wide"
          class="lg:col-start-2 lg:row-span-3 lg:row-start-1"
        >
          <OrderProductPicker
            :in-order="inOrder"
            @add="addProduct"
          />
        </div>

        <!-- Step 3: when it's delivered, the Order Discount and notes. -->
        <div
          v-if="shows('confirmar')"
          class="flex flex-col gap-4 lg:col-start-1"
        >
          <UFormField
            label="Fecha de entrega"
            name="deliveryDate"
          >
            <UInput
              v-model="state.deliveryDate"
              type="date"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Descuento del pedido"
            name="discountPercent"
            help="Se aplica después de los descuentos de cada producto."
          >
            <UInput
              v-model="state.discountPercent"
              placeholder="0"
              inputmode="decimal"
              autocomplete="off"
              class="w-28"
            >
              <template #trailing>
                <span class="text-muted">%</span>
              </template>
            </UInput>
          </UFormField>

          <UFormField
            label="Notas"
            name="notes"
          >
            <UTextarea
              v-model="state.notes"
              :rows="2"
              autoresize
              class="w-full"
            />
          </UFormField>
        </div>
      </UForm>

      <!-- On a phone, Products are added from the right; each tap adds one and it stays open. -->
      <USlideover
        v-if="!wide"
        v-model:open="adding"
        title="Agregar productos"
      >
        <template #body>
          <OrderProductPicker
            :in-order="inOrder"
            bare
            @add="addProduct"
          />
        </template>

        <template #footer>
          <div class="flex w-full items-center justify-between gap-4">
            <span class="flex flex-col">
              <span class="text-sm text-muted">{{ formatUnits(units) }} {{ units === 1 ? 'unidad' : 'unidades' }}</span>
              <span class="font-semibold text-highlighted tabular-nums">{{ formatMoney(totals.total) }}</span>
            </span>
            <UButton
              label="Listo"
              icon="i-lucide-check"
              @click="adding = false"
            />
          </div>
        </template>
      </USlideover>

      <UModal
        v-model:open="discarding"
        title="¿Descartar este pedido?"
        description="Se borran el cliente, los productos y lo demás que cargaste. No se puede deshacer."
      >
        <template #footer>
          <div class="flex w-full flex-col gap-2 sm:flex-row-reverse">
            <UButton
              label="Sí, descartar"
              color="error"
              block
              @click="discard"
            />
            <UButton
              label="Volver"
              color="neutral"
              variant="outline"
              block
              @click="discarding = false"
            />
          </div>
        </template>
      </UModal>

      <!-- The page's own overlays, e.g. the saved-Order sheet. -->
      <slot />
    </template>

    <template #footer>
      <div class="flex flex-col gap-3 border-t border-default p-4 sm:px-6">
        <!-- On a phone, where the Order is in the steps; a tap goes back, or forward once checked. -->
        <UStepper
          v-if="!wide"
          :items="stepItems"
          :model-value="step"
          :linear="false"
          size="xs"
          class="w-full"
          @update:model-value="goToStep"
        />

        <div class="flex items-center justify-between gap-4">
          <div class="flex flex-col">
            <span class="text-sm text-muted">
              Total<template v-if="units"> · {{ formatUnits(units) }} {{ units === 1 ? 'unidad' : 'unidades' }}</template>
            </span>
            <output
              aria-label="Total del pedido"
              aria-live="polite"
              class="text-xl font-semibold text-highlighted tabular-nums"
            >{{ formatMoney(totals.total) }}</output>
          </div>

          <div class="flex gap-2">
            <UButton
              v-if="!wide && previousStep"
              icon="i-lucide-arrow-left"
              aria-label="Paso anterior"
              color="neutral"
              variant="outline"
              @click="goTo(previousStep)"
            />
            <UButton
              v-if="!wide && nextStep"
              label="Siguiente"
              trailing-icon="i-lucide-arrow-right"
              @click="goTo(nextStep)"
            />
            <UButton
              v-else
              type="submit"
              form="order-form"
              :label="order ? 'Guardar cambios' : 'Confirmar pedido'"
              icon="i-lucide-check"
              :loading="saving"
            />
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
