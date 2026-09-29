import { BadRequestException, Controller, Get } from '@nestjs/common'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { FetchFriendRequestsUseCase } from '@/domain/social/applications/use-cases/fetch-friend-requests'

@Controller('/friend-requests')
export class FetchFriendRequestsController {
  constructor(private fetchFriendRequests: FetchFriendRequestsUseCase) {}

  @Get()
  async handle(@CurrentUser() user: UserPayload) {
    const result = await this.fetchFriendRequests.execute({ userId: user.sub })

    if (result.isLeft()) {
      throw new BadRequestException()
    }

    const { friendRequests } = result.value

    return { friendRequests }
  }
}
