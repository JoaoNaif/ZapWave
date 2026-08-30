import { Module } from '@nestjs/common'
import { EnvModule } from './env/env.module'
import { DatabaseModule } from './database/database.module'
import { RedisModule } from './redis/redis.module'
import { HealthController } from './http/health.controller'

@Module({
  imports: [EnvModule, DatabaseModule, RedisModule],
  controllers: [HealthController],
})
export class AppModule {}
