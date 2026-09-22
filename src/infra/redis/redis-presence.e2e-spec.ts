import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { EnvModule } from '@/infra/env/env.module'
import { RedisModule } from '@/infra/redis/redis.module'
import { RedisService } from '@/infra/redis/redis.service'
import { RedisPresence } from '@/infra/redis/redis-presence'

const PRESENCE_KEY = 'presence:online'
const ONLINE_THRESHOLD_MS = 45_000

describe('Redis Presence (e2e)', () => {
  let app: INestApplication
  let redis: RedisService
  let sut: RedisPresence

  const userIds: string[] = []

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, RedisModule],
      providers: [RedisPresence],
    }).compile()

    app = moduleRef.createNestApplication()
    redis = moduleRef.get(RedisService)
    sut = moduleRef.get(RedisPresence)

    await app.init()
  })

  afterAll(async () => {
    if (userIds.length > 0) {
      await redis.zrem(PRESENCE_KEY, ...userIds)
    }

    await app.close()
  })

  function uniqueUserId() {
    const id = randomUUID()
    userIds.push(id)
    return id
  }

  test('a user is offline with no lastSeenAt before any heartbeat', async () => {
    const userId = uniqueUserId()

    expect(await sut.isOnline(userId)).toBe(false)
    expect(await sut.lastSeenAt(userId)).toBeNull()
  })

  test('heartbeat marks the user online and sets lastSeenAt', async () => {
    const userId = uniqueUserId()

    await sut.heartbeat(userId)

    expect(await sut.isOnline(userId)).toBe(true)
    expect(await sut.lastSeenAt(userId)).toBeInstanceOf(Date)
  })

  test('a heartbeat older than the online window reports offline but keeps lastSeenAt', async () => {
    const userId = uniqueUserId()
    const longAgo = Date.now() - ONLINE_THRESHOLD_MS - 1000

    // escreve direto no sorted set (mesma chave/formato do adapter) pra
    // simular um heartbeat antigo sem depender de esperar tempo real
    await redis.zadd(PRESENCE_KEY, longAgo, userId)

    expect(await sut.isOnline(userId)).toBe(false)
    expect(await sut.lastSeenAt(userId)).toEqual(new Date(longAgo))
  })

  test('a second heartbeat only updates the score, does not duplicate the member', async () => {
    const userId = uniqueUserId()

    await sut.heartbeat(userId)
    await sut.heartbeat(userId)

    const count = await redis.zscore(PRESENCE_KEY, userId)
    expect(count).not.toBeNull()

    const rank = await redis.zrank(PRESENCE_KEY, userId)
    expect(rank).not.toBeNull()
  })

  test('does not affect the presence of other users', async () => {
    const userA = uniqueUserId()
    const userB = uniqueUserId()

    await sut.heartbeat(userA)

    expect(await sut.isOnline(userA)).toBe(true)
    expect(await sut.isOnline(userB)).toBe(false)
  })
})
