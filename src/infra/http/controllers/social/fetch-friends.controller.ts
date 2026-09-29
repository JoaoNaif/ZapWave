import { BadRequestException, Controller, Get } from '@nestjs/common'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { FetchFriendsUseCase } from '@/domain/social/applications/use-cases/fetch-friends'

@Controller('/friends')
export class FetchFriendsController {
  constructor(private fetchFriends: FetchFriendsUseCase) {}

  @Get()
  async handle(@CurrentUser() user: UserPayload) {
    const result = await this.fetchFriends.execute({ userId: user.sub })

    if (result.isLeft()) {
      throw new BadRequestException()
    }

    const { friends } = result.value

    return { friends }
  }
}
