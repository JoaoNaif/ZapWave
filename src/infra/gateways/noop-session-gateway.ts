import { Injectable } from '@nestjs/common'
import { SessionGateway } from '@/domain/accounts/applications/gateways/session-gateway'

/**
 * Stub temporário até o WebSocket (infra/websocket) existir. Revoga o device
 * no Postgres normalmente, mas não derruba nenhuma conexão em tempo real.
 */
@Injectable()
export class NoopSessionGateway implements SessionGateway {
  async disconnect(_deviceId: string): Promise<void> {}
}
