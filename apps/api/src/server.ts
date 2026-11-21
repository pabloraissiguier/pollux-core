/** Node server entry (`pnpm dev:api`, Docker). Listens on API_PORT from the root .env (3001). */
import { serve } from '@hono/node-server'
import app from './index'
import { readEnv } from './env'

const { API_PORT } = readEnv()

serve({ fetch: app.fetch, port: API_PORT }, (info) => {
  console.log(`API escuchando en http://localhost:${info.port}`)
})
