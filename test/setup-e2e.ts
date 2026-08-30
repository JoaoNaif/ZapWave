import { randomUUID } from 'node:crypto'
import { execSync } from 'node:child_process'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll } from 'vitest'

config({ path: '.env', override: false })

const prisma = new PrismaClient()
const schemaId = randomUUID()

function buildDatabaseURL(schema: string) {
  if (!process.env.DATABASE_URL) {
    throw new Error('Defina a variável de ambiente DATABASE_URL.')
  }

  const url = new URL(process.env.DATABASE_URL)
  url.searchParams.set('schema', schema)
  return url.toString()
}

beforeAll(async () => {
  process.env.DATABASE_URL = buildDatabaseURL(schemaId)
  // no-op enquanto não houver migrations; roda-as quando existirem.
  execSync('npx prisma migrate deploy', { stdio: 'ignore' })
})

afterAll(async () => {
  await prisma.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${schemaId}" CASCADE`,
  )
  await prisma.$disconnect()
})
