import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { RedisModule } from '../redis/redis.module'
import { ChatGateway } from './chat.gateway'
import { WsAuthService } from './ws-auth'

@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [ChatGateway, WsAuthService],
})
export class WebsocketModule {}
