import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { config } from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll } from 'vitest'

config({ path: '.env', override: false })

// Os e2e fazem dezenas de cadastros/logins seguidos do mesmo IP: com o limite
// de requisições ligado quase tudo daria 429. O arquivo que testa o limite
// religa isso antes de importar o app (ver hardening.e2e-spec.ts).
process.env.RATE_LIMIT_ENABLED = 'false'

const schemaId = randomUUID()

// Pool pequeno por arquivo: o padrão do Prisma é (CPUs * 2 + 1) conexões, e
// vários arquivos de teste rodam ao mesmo tempo contra o mesmo Postgres.
const CONNECTION_LIMIT = '5'

function buildDatabaseURL(schema?: string) {
  if (!process.env.DATABASE_URL) {
    throw new Error('Defina a variável de ambiente DATABASE_URL.')
  }

  const url = new URL(process.env.DATABASE_URL)
  if (schema) url.searchParams.set('schema', schema)
  url.searchParams.set('connection_limit', CONNECTION_LIMIT)
  return url.toString()
}

// Cliente só para criar/dropar o schema do arquivo; uma conexão basta.
const adminPrisma = new PrismaClient({
  datasourceUrl: buildDatabaseURL().replace(
    `connection_limit=${CONNECTION_LIMIT}`,
    'connection_limit=1'
  ),
})

beforeAll(async () => {
  process.env.DATABASE_URL = buildDatabaseURL(schemaId)

  // node direto no CLI do Prisma (sem npx, que adiciona segundos por arquivo);
  // timeout finito e stderr visível para a falha não virar um "hook timed out"
  execFileSync(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { stdio: 'pipe', timeout: 50_000 }
  )
})

afterAll(async () => {
  await adminPrisma.$executeRawUnsafe(
    `DROP SCHEMA IF EXISTS "${schemaId}" CASCADE`
  )
  await adminPrisma.$disconnect()
})
