import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { EnvService } from '../env/env.service'
import { EnvModule } from '../env/env.module'
import { APP_GUARD } from '@nestjs/core'
import { PrismaService } from '../database/prisma/prisma.service'
import { JwtAuthGuard } from './jwt-auth.guard'
import { JwtStrategy } from './jwt-strategy'

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [EnvModule],
      inject: [EnvService],
      global: true,
      useFactory(env: EnvService) {
        const privateKey = env.get('JWT_PRIVATE_KEY')
        const publicKey = env.get('JWT_PUBLIC_KEY')
        const expiresIn = '24h'

        return {
          signOptions: { algorithm: 'RS256', expiresIn },
          privateKey: Buffer.from(privateKey, 'base64'),
          publicKey: Buffer.from(publicKey, 'base64'),
        }
      },
    }),
  ],
  providers: [
    JwtStrategy,
    EnvService,
    PrismaService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AuthModule {}
