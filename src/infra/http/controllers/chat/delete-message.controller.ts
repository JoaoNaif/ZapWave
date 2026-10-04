import {
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { DeleteMessageUseCase } from '@/domain/chat/applications/use-cases/delete-message'

const messageIdParamSchema = z.string().ulid()

@Controller()
export class DeleteMessageController {
  constructor(private deleteMessage: DeleteMessageUseCase) {}

  @Delete('/message/:messageId')
  @HttpCode(204)
  async handle(
    @Param('messageId', new ZodValidationPipe(messageIdParamSchema))
    messageId: string,
    @CurrentUser() user: UserPayload
  ) {
    const result = await this.deleteMessage.execute({
      userId: user.sub,
      messageId,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        case NotAllowedError:
          throw new ForbiddenException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }
  }
}
