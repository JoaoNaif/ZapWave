import { Module } from '@nestjs/common'
import { EnvModule } from '../env/env.module'
import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { RedisService } from './redis.service'
import { RedisMessageStream } from './redis-message-stream'

@Module({
  imports: [EnvModule],
  providers: [
    RedisService,
    { provide: MessageStream, useClass: RedisMessageStream },
  ],
  exports: [RedisService, MessageStream],
})
export class RedisModule {}
