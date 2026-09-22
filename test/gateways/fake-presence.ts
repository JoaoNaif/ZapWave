import { Presence } from '@/domain/chat/applications/gateways/presence'

export class FakePresence implements Presence {
  private lastHeartbeatAt = new Map<string, Date>()

  // janela pequena o bastante pra um teste conseguir simular "expirou" sem
  // precisar mockar relógio — ver o mesmo trade-off em RedisPresence
  public onlineThresholdMs = 1000

  async heartbeat(userId: string): Promise<void> {
    this.lastHeartbeatAt.set(userId, new Date())
  }

  async isOnline(userId: string): Promise<boolean> {
    const lastSeen = this.lastHeartbeatAt.get(userId)
    if (!lastSeen) return false

    return Date.now() - lastSeen.getTime() <= this.onlineThresholdMs
  }

  async lastSeenAt(userId: string): Promise<Date | null> {
    return this.lastHeartbeatAt.get(userId) ?? null
  }
}
