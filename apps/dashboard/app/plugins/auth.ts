/** Restores the stored session before the route middleware decides where to go. */
export default defineNuxtPlugin(async () => {
  await useAuth().init()
})
