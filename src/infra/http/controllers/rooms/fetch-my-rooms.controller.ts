import { BadRequestException, Controller, Get } from '@nestjs/common'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { FetchMyRoomsUseCase } from '@/domain/rooms/applications/use-cases/fetch-my-rooms'

@Controller('/rooms')
export class FetchMyRoomsController {
  constructor(private fetchMyRooms: FetchMyRoomsUseCase) {}

  @Get()
  async handle(@CurrentUser() user: UserPayload) {
    const result = await this.fetchMyRooms.execute({ userId: user.sub })

    if (result.isLeft()) {
      throw new BadRequestException()
    }

    const { rooms } = result.value

    return { rooms }
  }
}
