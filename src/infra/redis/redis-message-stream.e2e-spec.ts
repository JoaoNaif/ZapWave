import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { EnvModule } from '@/infra/env/env.module'
import { RedisModule } from '@/infra/redis/redis.module'
import { RedisService } from '@/infra/redis/redis.service'
import { RedisMessageStream } from '@/infra/redis/redis-message-stream'
import { makeMessage } from 'test/factories/make-message'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'

describe('Redis Message Stream (e2e)', () => {
  let app: INestApplication
  let redis: RedisService
  let sut: RedisMessageStream

  const deviceIds: string[] = []

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [EnvModule, RedisModule],
      providers: [RedisMessageStream],
    }).compile()

    app = moduleRef.createNestApplication()
    redis = moduleRef.get(RedisService)
    sut = moduleRef.get(RedisMessageStream)

    await app.init()
  })

  afterAll(async () => {
    // limpa só as chaves criadas por este arquivo — outros e2e podem rodar
    // em paralelo contra o mesmo Redis (ver vitest.config.e2e.ts maxWorkers)
    if (deviceIds.length > 0) {
      await redis.del(...deviceIds.map((id) => `chat:inbox:${id}`))
    }

    await app.close()
  })

  function uniqueDeviceId() {
    const id = randomUUID()
    deviceIds.push(id)
    return id
  }

  function makeMessageWithId(conversationId: string, id: string) {
    return makeMessage(
      { conversationId: new UniqueEntityId(conversationId) },
      new UniqueEntityId(id)
    )
  }

  async function collect(iterable: AsyncIterable<{ id: UniqueEntityId }>) {
    const ids: string[] = []

    for await (const message of iterable) {
      ids.push(message.id.toString())
    }

    return ids
  }

  describe('replayFrom', () => {
    test('replays every pending message of the device in order when there is no cursor', async () => {
      const deviceId = uniqueDeviceId()
      const conversationId = randomUUID()

      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-1'),
        [deviceId]
      )
      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-2'),
        [deviceId]
      )

      expect(await collect(sut.replayFrom(deviceId, null))).toEqual([
        'msg-1',
        'msg-2',
      ])
    })

    test('replays only the messages after the cursor', async () => {
      const deviceId = uniqueDeviceId()
      const conversationId = randomUUID()

      for (const id of ['msg-1', 'msg-2', 'msg-3']) {
        await sut.publish(
          conversationId,
          makeMessageWithId(conversationId, id),
          [deviceId]
        )
      }

      expect(await collect(sut.replayFrom(deviceId, 'msg-1'))).toEqual([
        'msg-2',
        'msg-3',
      ])
    })

    test('keeps one inbox per device', async () => {
      const deviceA = uniqueDeviceId()
      const deviceB = uniqueDeviceId()
      const conversationId = randomUUID()

      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-1'),
        [deviceA, deviceB]
      )
      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-2'),
        [deviceB]
      )

      expect(await collect(sut.replayFrom(deviceA, null))).toEqual(['msg-1'])
      expect(await collect(sut.replayFrom(deviceB, null))).toEqual([
        'msg-1',
        'msg-2',
      ])
    })

    test('finishes without messages for a device with an empty inbox', async () => {
      const deviceId = uniqueDeviceId()

      expect(await collect(sut.replayFrom(deviceId, null))).toEqual([])
    })

    test('sees messages published before the device ever connected', async () => {
      // regressão do id '0' na criação do grupo (docs/06-redis-streams.md §2):
      // com '$' estas mensagens ficariam invisíveis para sempre
      const deviceId = uniqueDeviceId()
      const conversationId = randomUUID()

      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-1'),
        [deviceId]
      )

      expect(await collect(sut.replayFrom(deviceId, null))).toEqual(['msg-1'])
    })

    test('recovers from a pending entry the publish() MAXLEN already trimmed from the stream', async () => {
      // regressão do XAUTOCLAIM (docs/06-redis-streams.md §7): antes disso, uma
      // entrada pendente cujo dado o MAXLEN já removeu da stream vinha como
      // [id, null] no read '0' e derrubava o mapper inteiro
      const deviceId = uniqueDeviceId()
      const conversationId = randomUUID()
      const key = `chat:inbox:${deviceId}`

      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-ghost'),
        [deviceId]
      )
      // entrega msg-ghost pro PEL (via '>'), sem confirmar
      await collect(sut.replayFrom(deviceId, null))

      // simula o device ficando offline tempo suficiente pro publish() ir
      // trimando a stream por baixo — usa a mesma chave interna do adapter,
      // com um MAXLEN agressivo só pra forçar o cenário neste teste
      for (let i = 0; i < 3; i++) {
        await redis.xadd(
          key,
          'MAXLEN',
          '1',
          '*',
          'messageId',
          `filler-${i}`,
          'body',
          'x'
        )
      }

      await expect(collect(sut.replayFrom(deviceId, null))).resolves.toEqual([
        'filler-2',
      ])

      // msg-ghost saiu do PEL sozinho (via XAUTOCLAIM); só sobra o que essa
      // mesma chamada acabou de entregar por '>' (filler-2)
      const pending = await redis.xpending(key, 'delivery')
      expect(pending[0]).toBe(1)
    })
  })

  describe('ack', () => {
    test('removes the acknowledged message and the older ones from the inbox', async () => {
      const deviceId = uniqueDeviceId()
      const conversationId = randomUUID()

      for (const id of ['msg-1', 'msg-2', 'msg-3']) {
        await sut.publish(
          conversationId,
          makeMessageWithId(conversationId, id),
          [deviceId]
        )
      }

      await sut.ack(deviceId, 'msg-2')

      expect(await collect(sut.replayFrom(deviceId, null))).toEqual(['msg-3'])
    })

    test('does not touch the inbox of other devices', async () => {
      const deviceA = uniqueDeviceId()
      const deviceB = uniqueDeviceId()
      const conversationId = randomUUID()

      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-1'),
        [deviceA, deviceB]
      )

      await sut.ack(deviceA, 'msg-1')

      expect(await collect(sut.replayFrom(deviceB, null))).toEqual(['msg-1'])
    })

    test('is a no-op for a device with no pending messages', async () => {
      const deviceId = uniqueDeviceId()

      await expect(sut.ack(deviceId, 'msg-1')).resolves.toBeUndefined()
    })
  })

  describe('subscribe', () => {
    test('delivers a message published after the consumer started waiting', async () => {
      const deviceId = uniqueDeviceId()
      const conversationId = randomUUID()
      const iterator = sut.subscribe(deviceId)[Symbol.asyncIterator]()

      const next = iterator.next()
      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-1'),
        [deviceId]
      )

      const result = await next

      expect(result.done).toBe(false)
      expect(result.value?.id.toString()).toBe('msg-1')

      await iterator.return?.()
    }, 10_000)

    test('only delivers messages addressed to its own device', async () => {
      const deviceA = uniqueDeviceId()
      const deviceB = uniqueDeviceId()
      const conversationId = randomUUID()
      const iterator = sut.subscribe(deviceA)[Symbol.asyncIterator]()

      const next = iterator.next()
      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-for-b'),
        [deviceB]
      )
      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-for-a'),
        [deviceA]
      )

      const result = await next

      expect(result.value?.id.toString()).toBe('msg-for-a')

      await iterator.return?.()
    }, 10_000)

    test('does not auto-ack: the message stays pending until ack() is called', async () => {
      const deviceId = uniqueDeviceId()
      const conversationId = randomUUID()
      const iterator = sut.subscribe(deviceId)[Symbol.asyncIterator]()

      const next = iterator.next()
      await sut.publish(
        conversationId,
        makeMessageWithId(conversationId, 'msg-1'),
        [deviceId]
      )
      await next
      await iterator.return?.()

      expect(await collect(sut.replayFrom(deviceId, null))).toEqual(['msg-1'])
    }, 10_000)
  })
})
