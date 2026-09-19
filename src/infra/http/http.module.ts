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
import { SendFriendInviteController } from './controllers/social/send-friend-invite.controller'
import { AcceptController } from './controllers/social/accept.controller'
import { DeclineController } from './controllers/social/decline.controller'
import { SendFriendInviteUseCase } from '@/domain/social/applications/use-cases/send-friend-invite'
import { AcceptUseCase } from '@/domain/social/applications/use-cases/accept'
import { DeclineUseCase } from '@/domain/social/applications/use-cases/decline'
import { CreateRoomController } from './controllers/rooms/create-room.controller'
import { CreateRoomUseCase } from '@/domain/rooms/applications/use-cases/create-room'
import { InviteToRoomController } from './controllers/rooms/invite-to-room.controller'
import { InviteToRoomUseCase } from '@/domain/rooms/applications/use-cases/invite-to-room'
import { AcceptRoomInviteController } from './controllers/rooms/accept-room-invite.controller'
import { AcceptRoomInviteUseCase } from '@/domain/rooms/applications/use-cases/accept-room-invite'
import { LeaveRoomController } from './controllers/rooms/leave-room.controller'
import { LeaveRoomUseCase } from '@/domain/rooms/applications/use-cases/leave-room'
import { RemoveMemberUseCase } from '@/domain/rooms/applications/use-cases/remove-member'
import { RemoveMemberController } from './controllers/rooms/remove-member.controller'

@Module({
  imports: [DatabaseModule, CryptographyModule, EnvModule],
  controllers: [
    AuthenticateUserController,
    RegisterUserController,
    RevokeDeviceController,
    SendFriendInviteController,
    AcceptController,
    DeclineController,
    CreateRoomController,
    InviteToRoomController,
    AcceptRoomInviteController,
    LeaveRoomController,
    RemoveMemberController,
    HealthController,
  ],
  providers: [
    AuthenticateUserUseCase,
    RegisterUserUseCase,
    RevokeDeviceUseCase,
    SendFriendInviteUseCase,
    AcceptUseCase,
    DeclineUseCase,
    CreateRoomUseCase,
    InviteToRoomUseCase,
    AcceptRoomInviteUseCase,
    LeaveRoomUseCase,
    RemoveMemberUseCase,
    { provide: SessionGateway, useClass: NoopSessionGateway },
  ],
})
export class HttpModule {}
