import { z } from 'zod'

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().default(3333),

  DATABASE_URL: z.string().url(),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_DB: z.coerce.number().default(0),

  JWT_SECRET: z.string(),
})

export type Env = z.infer<typeof envSchema>
