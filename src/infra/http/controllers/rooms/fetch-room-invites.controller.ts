import { BadRequestException, Controller, Get } from '@nestjs/common'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { FetchRoomInvitesUseCase } from '@/domain/rooms/applications/use-cases/fetch-room-invites'

@Controller('/room-invites')
export class FetchRoomInvitesController {
  constructor(private fetchRoomInvites: FetchRoomInvitesUseCase) {}

  @Get()
  async handle(@CurrentUser() user: UserPayload) {
    const result = await this.fetchRoomInvites.execute({ userId: user.sub })

    if (result.isLeft()) {
      throw new BadRequestException()
    }

    const { roomInvites } = result.value

    return { roomInvites }
  }
}
