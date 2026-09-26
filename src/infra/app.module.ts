import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { EnvModule } from './env/env.module'
import { EnvService } from './env/env.service'
import { DatabaseModule } from './database/database.module'
import { RedisModule } from './redis/redis.module'
import { HttpModule } from './http/http.module'
import { AuthModule } from './auth/auth.module'
import { WebsocketModule } from './websocket/websocket.module'
import { NotificationModule } from './notification/notification.module'

@Module({
  imports: [
    EnvModule,
    // Limite geral por IP (folgado: só barra inundação). Login e cadastro têm
    // limites mais duros, definidos com @Throttle nos próprios controllers.
    ThrottlerModule.forRootAsync({
      inject: [EnvService],
      useFactory: (env: EnvService) => ({
        throttlers: [{ ttl: 60_000, limit: 300 }],
        skipIf: () => !env.get('RATE_LIMIT_ENABLED'),
      }),
    }),
    DatabaseModule,
    RedisModule,
    AuthModule,
    HttpModule,
    WebsocketModule,
    NotificationModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
