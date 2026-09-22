import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { RedisModule } from '../redis/redis.module'
import { AckMessageDeliveryUseCase } from '@/domain/chat/applications/use-cases/ack-message-delivery'
import { ChatGateway } from './chat.gateway'
import { WsAuthService } from './ws-auth'

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [ChatGateway, WsAuthService, AckMessageDeliveryUseCase],
})
export class WebsocketModule {}
