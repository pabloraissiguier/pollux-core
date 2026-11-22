/**
 * Today as `yyyy-mm-dd` in America/Argentina/Cordoba: the default Delivered date and Payment date.
 * The same function bounds them in `pastDaySchema`, so a default can never be refused as future.
 */
export { todayInCordoba as today } from '@pollux/contracts'
