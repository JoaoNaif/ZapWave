import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { RedisModule } from '../redis/redis.module'
import { AckMessageDeliveryUseCase } from '@/domain/chat/applications/use-cases/ack-message-delivery'
import { SessionGateway } from '@/domain/accounts/applications/gateways/session-gateway'
import { DeviceSessionModule } from '../auth/device-session.module'
import { ChatGateway } from './chat.gateway'
import { ConnectionRegistry } from './connection-registry'
import { WsAuthService } from './ws-auth'
import { WsSessionGateway } from './ws-session-gateway'

@Module({
  imports: [DatabaseModule, RedisModule, DeviceSessionModule],
  providers: [
    ChatGateway,
    WsAuthService,
    AckMessageDeliveryUseCase,
    ConnectionRegistry,
    // o HttpModule (revoke-device) usa este adapter no lugar do antigo Noop
    { provide: SessionGateway, useClass: WsSessionGateway },
  ],
  exports: [SessionGateway],
})
export class WebsocketModule {}
