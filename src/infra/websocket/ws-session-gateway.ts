import { Injectable } from '@nestjs/common'
import { SessionGateway } from '@/domain/accounts/applications/gateways/session-gateway'
import { DeviceSessionCache } from '../auth/device-session-cache'
import { CLOSE_UNAUTHORIZED } from './close-codes'
import { ConnectionRegistry } from './connection-registry'

/**
 * Adapter real do port `SessionGateway`: "derrubar este device" = cortar o
 * HTTP e fechar o WebSocket aberto. Só é chamado pelo `RevokeDeviceUseCase`,
 * depois da revogação já estar gravada no Postgres.
 */
@Injectable()
export class WsSessionGateway implements SessionGateway {
  constructor(
    private deviceSessions: DeviceSessionCache,
    private connections: ConnectionRegistry
  ) {}

  async disconnect(deviceId: string): Promise<void> {
    // primeiro o HTTP: assim, mesmo que o cliente reconecte no mesmo instante,
    // a reconexão já é recusada
    await this.deviceSessions.markRevoked(deviceId)

    this.connections.closeAll(deviceId, CLOSE_UNAUTHORIZED, 'revoked')
  }
}
