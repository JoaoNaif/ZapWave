import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { RedisModule } from '../redis/redis.module'
import { DeviceSessionCache } from './device-session-cache'

// Módulo à parte porque duas pontas usam o mesmo cache: o JwtStrategy (HTTP,
// no AuthModule) e o WsSessionGateway (WebSocket, no WebsocketModule).
@Module({
  imports: [DatabaseModule, RedisModule],
  providers: [DeviceSessionCache],
  exports: [DeviceSessionCache],
})
export class DeviceSessionModule {}
