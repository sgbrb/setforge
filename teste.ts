import { PrismaClient } from '@prisma/client'
import { config } from 'dotenv'

config({ path: '.env.local' })
config({ path: '.env' })

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } }
})

async function main() {
  const track = await prisma.track.findFirst({
    where: { title: { contains: 'yan-cook-freefall' } },
    select: { title: true, segments: true }
  })
  console.log(JSON.stringify(track, null, 2))
}

main().catch(console.error).finally(() => prisma.$disconnect())