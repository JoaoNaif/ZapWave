import { Injectable, Logger } from '@nestjs/common'
import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { RedisService } from '../redis/redis.service'

// Quanto tempo uma resposta "device ativo" vale. Não é o que garante a
// revogação (isso é o markRevoked, na hora) — é só o seguro pro caso do
// Redis ter falhado justamente no momento de revogar.
const ACTIVE_TTL_SECONDS = 5 * 60

// Igual à vida do JWT (24h, ver auth.module.ts): depois disso o token não
// vale mais de qualquer jeito, então a marca não precisa durar mais.
const REVOKED_TTL_SECONDS = 24 * 60 * 60

const ACTIVE = 'active'
const REVOKED = 'revoked'

const keyOf = (deviceId: string) => `device-session:${deviceId}`

/**
 * Responde "esse device ainda pode usar a API?" sem ir ao Postgres a cada
 * request. Postgres continua sendo a verdade (`Device.revokedAt`); o Redis é
 * só cache na frente dele:
 *
 *  - `isActive`: olha o Redis; se não souber, pergunta ao Postgres e guarda.
 *  - `markRevoked`: chamado logo depois de gravar a revogação no Postgres;
 *    sobrescreve o "active" e vale na hora pra todas as instâncias.
 *
 * Se o Redis cair, tudo continua funcionando — só volta a consultar o
 * Postgres em cada request.
 */
@Injectable()
export class DeviceSessionCache {
  private readonly logger = new Logger(DeviceSessionCache.name)

  constructor(
    private redis: RedisService,
    private devicesRepository: DevicesRepository
  ) {}

  async isActive(userId: string, deviceId: string): Promise<boolean> {
    const cached = await this.read(deviceId)
    if (cached) return cached === ACTIVE

    const device = await this.devicesRepository.findById(deviceId)
    if (!device || device.userId.toString() !== userId) return false

    if (device.isRevoked) {
      await this.markRevoked(deviceId)
      return false
    }

    // NX: nunca sobrescreve. Se uma revogação chegou entre a leitura do
    // Postgres e aqui, o "revoked" dela tem que ganhar do "active" velho.
    await this.write(deviceId, ACTIVE, ACTIVE_TTL_SECONDS, {
      onlyIfMissing: true,
    })

    return true
  }

  async markRevoked(deviceId: string): Promise<void> {
    await this.write(deviceId, REVOKED, REVOKED_TTL_SECONDS)
  }

  // O cache é opcional: qualquer falha do Redis vira "não sei" / "não gravei"
  // e a checagem cai pro Postgres, em vez de derrubar a requisição.
  private async read(deviceId: string): Promise<string | null> {
    try {
      return await this.redis.get(keyOf(deviceId))
    } catch (error) {
      this.logger.warn(`cache de sessão indisponível (leitura): ${error}`)
      return null
    }
  }

  private async write(
    deviceId: string,
    value: string,
    ttlSeconds: number,
    { onlyIfMissing = false } = {}
  ) {
    try {
      if (onlyIfMissing) {
        await this.redis.set(keyOf(deviceId), value, 'EX', ttlSeconds, 'NX')
      } else {
        await this.redis.set(keyOf(deviceId), value, 'EX', ttlSeconds)
      }
    } catch (error) {
      this.logger.error(`cache de sessão indisponível (escrita): ${error}`)
    }
  }
}
