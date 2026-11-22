const cordobaDay = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Cordoba',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Today as `yyyy-mm-dd` in America/Argentina/Cordoba: the default Delivered date and Payment date. */
export function today(now = new Date()): string {
  return cordobaDay.format(now)
}
