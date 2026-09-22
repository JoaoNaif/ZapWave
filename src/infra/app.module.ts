import { Module } from '@nestjs/common'
import { EnvModule } from './env/env.module'
import { DatabaseModule } from './database/database.module'
import { RedisModule } from './redis/redis.module'
import { HttpModule } from './http/http.module'
import { AuthModule } from './auth/auth.module'
import { WebsocketModule } from './websocket/websocket.module'

@Module({
  imports: [
    EnvModule,
    DatabaseModule,
    RedisModule,
    AuthModule,
    HttpModule,
    WebsocketModule,
  ],
})
export class AppModule {}
