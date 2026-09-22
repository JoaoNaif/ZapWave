import { Injectable } from '@nestjs/common'
import { Presence } from '@/domain/chat/applications/gateways/presence'
import { RedisService } from './redis.service'

const PRESENCE_KEY = 'presence:online'

// Janela de tolerância: "online" = heartbeat dentro dos últimos 45s. O
// gateway pinga a cada 20s (ver heartbeat.ts), então isso sobrevive a 1 ping
// perdido sem oscilar entre online/offline à toa.
const ONLINE_THRESHOLD_MS = 45_000

/**
 * Um sorted set só, chave global (não por sala): membro = userId, score =
 * epoch ms do último heartbeat. heartbeat() em cima de um membro existente
 * só atualiza o score — o set nunca cresce por reconexão, só por usuário
 * novo. "Online" e "visto por último" saem do mesmo dado (o score É o
 * último-visto); não existe um estado "offline" gravado, só ausência de
 * heartbeat recente — daí o nome "presence", não "status".
 */
@Injectable()
export class RedisPresence implements Presence {
  constructor(private readonly redis: RedisService) {}

  async heartbeat(userId: string): Promise<void> {
    await this.redis.zadd(PRESENCE_KEY, Date.now(), userId)
  }

  async isOnline(userId: string): Promise<boolean> {
    const lastSeen = await this.lastSeenAt(userId)
    if (!lastSeen) return false

    return Date.now() - lastSeen.getTime() <= ONLINE_THRESHOLD_MS
  }

  async lastSeenAt(userId: string): Promise<Date | null> {
    const score = await this.redis.zscore(PRESENCE_KEY, userId)
    if (score === null) return null

    return new Date(Number(score))
  }
}
