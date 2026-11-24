/**
 * Whether the screen is at least Tailwind's `lg` wide (64rem), where a form like the Order's fits
 * on one page instead of in steps. Follows the screen as it changes (a rotated tablet, a resized
 * window).
 */
export function useWideScreen() {
  const query = window.matchMedia('(min-width: 64rem)')
  const wide = ref(query.matches)
  const update = (event: MediaQueryListEvent) => {
    wide.value = event.matches
  }
  query.addEventListener('change', update)
  onScopeDispose(() => query.removeEventListener('change', update))
  return readonly(wide)
}
