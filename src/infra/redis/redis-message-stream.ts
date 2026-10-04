import { Injectable } from '@nestjs/common'
import { Redis } from 'ioredis'
import {
  MessageStream,
  StreamEvent,
} from '@/domain/chat/applications/gateways/message-stream'
import { Message } from '@/domain/chat/entities/message'
import { RedisService } from './redis.service'
import { RedisMessageMapper } from './mappers/redis-message-mapper'

const CONSUMER_GROUP = 'delivery'
const CONSUMER_NAME = 'device' // 1 conexão WS ativa por device — ver docs/06-redis-streams.md §1
const INBOX_MAXLEN = 1000
const BLOCK_MS = 5_000

function inboxKey(deviceId: string): string {
  return `chat:inbox:${deviceId}`
}

// XADD não precisa do grupo existir; só quem lê (XREADGROUP) precisa.
// id '0' (não '$'): o grupo enxerga desde o início da stream, para não perder
// mensagens publicadas antes do device nunca ter se conectado.
async function ensureGroup(redis: Redis, key: string): Promise<void> {
  try {
    await redis.xgroup('CREATE', key, CONSUMER_GROUP, '0', 'MKSTREAM')
  } catch (error) {
    if (error instanceof Error && error.message.includes('BUSYGROUP')) return
    throw error
  }
}

@Injectable()
export class RedisMessageStream implements MessageStream {
  constructor(private readonly redis: RedisService) {}

  async publish(
    _conversationId: string,
    message: Message,
    recipientDeviceIds: string[]
  ): Promise<void> {
    await this.fanOut(RedisMessageMapper.toFields(message), recipientDeviceIds)
  }

  async publishEvent(
    event: Exclude<StreamEvent, { type: 'message' }>,
    recipientDeviceIds: string[]
  ): Promise<void> {
    await this.fanOut(
      RedisMessageMapper.eventToFields(event),
      recipientDeviceIds
    )
  }

  private async fanOut(
    fields: string[],
    recipientDeviceIds: string[]
  ): Promise<void> {
    await Promise.all(
      recipientDeviceIds.map((deviceId) =>
        this.redis.xadd(
          inboxKey(deviceId),
          'MAXLEN',
          '~',
          INBOX_MAXLEN,
          '*',
          ...fields
        )
      )
    )
  }

  async ack(deviceId: string, eventId: string): Promise<void> {
    const key = inboxKey(deviceId)

    await ensureGroup(this.redis, key)

    const entries = await this.redis.xrange(key, '-', '+')

    // ack cumulativo: essa mensagem e todas as anteriores (mesma regra do
    // Device.resumeCursorId no Postgres) — ver docs/06-redis-streams.md §4
    const idsToRemove = entries
      .filter(
        ([, fields]) => RedisMessageMapper.eventIdOf(fields) <= eventId
      )
      .map(([redisId]) => redisId)

    if (idsToRemove.length === 0) return

    await this.redis.xack(key, CONSUMER_GROUP, ...idsToRemove)
    await this.redis.xdel(key, ...idsToRemove)
  }

  async *subscribe(deviceId: string): AsyncIterable<StreamEvent> {
    const key = inboxKey(deviceId)
    const connection = this.redis.duplicate()

    try {
      await ensureGroup(connection, key)

      while (true) {
        const result = await connection.xreadgroup(
          'GROUP',
          CONSUMER_GROUP,
          CONSUMER_NAME,
          'COUNT',
          50,
          'BLOCK',
          BLOCK_MS,
          'STREAMS',
          key,
          '>'
        )

        if (!result) continue

        const [[, entries]] = result as [string, [string, string[]][]][]

        for (const [, fields] of entries) {
          yield RedisMessageMapper.fieldsToEvent(fields)
        }
      }
    } finally {
      connection.disconnect()
    }
  }

  async *replayFrom(
    deviceId: string,
    afterEventId: string | null
  ): AsyncIterable<StreamEvent> {
    const key = inboxKey(deviceId)
    const connection = this.redis.duplicate()

    try {
      await ensureGroup(connection, key)

      // XAUTOCLAIM (não XREADGROUP id '0'): reclama pra si mesmo tudo que já
      // está pendente neste consumer — de uma sessão anterior que caiu sem
      // confirmar — e, de brinde, dá baixa sozinho em qualquer entrada
      // "fantasma": uma que o MAXLEN do publish() já removeu da stream mas
      // que ainda constava como pendente. Sem isso, essa entrada fantasma
      // volta com fields=null e derruba o mapper. minIdleTime 0 porque não
      // existe outro consumer pra disputar posse — reclamar de si mesmo é
      // inofensivo, só reseta o relógio de idle. Ver docs/06 §3 e §7.
      const claimed = await connection.xautoclaim(
        key,
        CONSUMER_GROUP,
        CONSUMER_NAME,
        0,
        '0-0',
        'COUNT',
        1000
      )
      const [, pendingEntries] = claimed as [string, [string, string[]][], string[]]

      const fresh = await connection.xreadgroup(
        'GROUP',
        CONSUMER_GROUP,
        CONSUMER_NAME,
        'COUNT',
        1000,
        'STREAMS',
        key,
        '>'
      )
      const freshEntries = fresh
        ? (fresh as [string, [string, string[]][]][])[0][1]
        : []

      for (const [, fields] of [...pendingEntries, ...freshEntries]) {
        const eventId = RedisMessageMapper.eventIdOf(fields)

        // defensivo: filtra de novo mesmo lendo do PEL (ver docs/06 §3)
        if (afterEventId !== null && eventId <= afterEventId) continue

        yield RedisMessageMapper.fieldsToEvent(fields)
      }
    } finally {
      connection.disconnect()
    }
  }
}
