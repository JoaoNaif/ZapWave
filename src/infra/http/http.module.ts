import { Module } from '@nestjs/common'
import { DatabaseModule } from '../database/database.module'
import { CryptographyModule } from '../cryptography/cryptography.module'
import { EnvModule } from '../env/env.module'
import { AuthenticateUserController } from './controllers/account/authenticate-user.controller'
import { RegisterUserController } from './controllers/account/register-user.controller'
import { RevokeDeviceController } from './controllers/account/revoke-device.controller'
import { HealthController } from './controllers/health.controller'
import { AuthenticateUserUseCase } from '@/domain/accounts/applications/use-cases/authenticate-user'
import { RegisterUserUseCase } from '@/domain/accounts/applications/use-cases/register-user'
import { RevokeDeviceUseCase } from '@/domain/accounts/applications/use-cases/revoke-device'
import { SessionGateway } from '@/domain/accounts/applications/gateways/session-gateway'
import { NoopSessionGateway } from '../gateways/noop-session-gateway'

@Module({
  imports: [DatabaseModule, CryptographyModule, EnvModule],
  controllers: [
    AuthenticateUserController,
    RegisterUserController,
    RevokeDeviceController,
    HealthController,
  ],
  providers: [
    AuthenticateUserUseCase,
    RegisterUserUseCase,
    RevokeDeviceUseCase,
    { provide: SessionGateway, useClass: NoopSessionGateway },
  ],
})
export class HttpModule {}
