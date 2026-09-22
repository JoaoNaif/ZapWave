import { BadRequestException, Controller, Get } from '@nestjs/common'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { FetchNotificationsUseCase } from '@/domain/notification/applications/use-cases/fetch-notification'

@Controller()
export class FetchNotificationsController {
  constructor(private fetchNotifications: FetchNotificationsUseCase) {}

  @Get('/notifications')
  async handle(@CurrentUser() user: UserPayload) {
    const userId = user.sub

    const result = await this.fetchNotifications.execute({ userId })

    if (result.isLeft()) {
      throw new BadRequestException()
    }

    const { notifications } = result.value

    return {
      notifications,
    }
  }
}
