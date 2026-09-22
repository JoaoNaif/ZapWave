import { Module } from '@nestjs/common'
import { EnvModule } from '../env/env.module'
import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { Presence } from '@/domain/chat/applications/gateways/presence'
import { RedisService } from './redis.service'
import { RedisMessageStream } from './redis-message-stream'
import { RedisPresence } from './redis-presence'

@Module({
  imports: [EnvModule],
  providers: [
    RedisService,
    { provide: MessageStream, useClass: RedisMessageStream },
    { provide: Presence, useClass: RedisPresence },
  ],
  exports: [RedisService, MessageStream, Presence],
})
export class RedisModule {}
