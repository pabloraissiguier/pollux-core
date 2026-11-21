/**
 * The app's look, set once for every screen. Change a component here (defaultVariants, slots)
 * instead of restyling single instances with `class` or `:ui`.
 */
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate'
    },

    // Touch-sized controls: the owner works one-handed on a phone. Inputs already use 16px text
    // on small screens, so iOS doesn't zoom in on focus.
    button: { defaultVariants: { size: 'lg' } },
    input: { defaultVariants: { size: 'lg' } },
    inputMenu: { defaultVariants: { size: 'lg' } },
    inputNumber: { defaultVariants: { size: 'lg' } },
    select: { defaultVariants: { size: 'lg' } },
    selectMenu: { defaultVariants: { size: 'lg' } },
    textarea: { defaultVariants: { size: 'lg' } },
    formField: { defaultVariants: { size: 'lg' } }
  }
})
