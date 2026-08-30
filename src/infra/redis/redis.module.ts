import { Module } from '@nestjs/common'
import { EnvModule } from '../env/env.module'
import { RedisService } from './redis.service'

@Module({
  imports: [EnvModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
