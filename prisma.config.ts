import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// Carrega .env.local PRIMEIRO (Next.js usa esse), depois .env como fallback
config({ path: '.env.local' })
config({ path: '.env' })

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DIRECT_URL'),
  },
})