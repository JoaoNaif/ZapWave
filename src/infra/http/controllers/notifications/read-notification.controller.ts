import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Put,
  UnauthorizedException,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ReadNotificationUseCase } from '@/domain/notification/applications/use-cases/read-notification'

const readNotificationBodySchema = z.object({
  notificationId: z.string().uuid(),
})

type ReadNotificationBodySchema = z.infer<typeof readNotificationBodySchema>

@Controller()
export class ReadNotificationController {
  constructor(private readNotification: ReadNotificationUseCase) {}

  @Put('/notification-read')
  @HttpCode(200)
  async handle(
    @Body(new ZodValidationPipe(readNotificationBodySchema))
    body: ReadNotificationBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { notificationId } = body

    const result = await this.readNotification.execute({
      recipientId: userId,
      notificationId,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        case NotAllowedError:
          throw new UnauthorizedException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { notification } = result.value

    return {
      notification,
    }
  }
}
