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
import { AckMessageDeliveryUseCase } from '@/domain/chat/applications/use-cases/ack-message-delivery'

const ackMessageDeliveryBodySchema = z.object({
  deviceId: z.string().uuid(),
  messageId: z.string().ulid(),
})

type AckMessageDeliveryBodySchema = z.infer<typeof ackMessageDeliveryBodySchema>

@Controller()
export class AckMessageDeliveryController {
  constructor(private ackMessageDelivery: AckMessageDeliveryUseCase) {}

  @Put('/message-ack')
  @HttpCode(200)
  async handle(
    @Body(new ZodValidationPipe(ackMessageDeliveryBodySchema))
    body: AckMessageDeliveryBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { deviceId, messageId } = body

    const result = await this.ackMessageDelivery.execute({
      userId,
      deviceId,
      messageId,
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

    const { acknowledged } = result.value

    return {
      acknowledged,
    }
  }
}
