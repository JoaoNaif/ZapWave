import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { envSchema } from './env'
import { EnvService } from './env.service'

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (env) => envSchema.parse(env),
    }),
  ],
  providers: [EnvService],
  exports: [EnvService],
})
export class EnvModule {}
