import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { EditMessageUseCase } from '@/domain/chat/applications/use-cases/edit-message'

const messageIdParamSchema = z.string().ulid()

const editMessageBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
})

type EditMessageBodySchema = z.infer<typeof editMessageBodySchema>

@Controller()
export class EditMessageController {
  constructor(private editMessage: EditMessageUseCase) {}

  @Patch('/message/:messageId')
  @HttpCode(200)
  async handle(
    @Param('messageId', new ZodValidationPipe(messageIdParamSchema))
    messageId: string,
    @Body(new ZodValidationPipe(editMessageBodySchema))
    body: EditMessageBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const result = await this.editMessage.execute({
      userId: user.sub,
      messageId,
      body: body.body,
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

    const { message } = result.value

    return {
      message,
    }
  }
}
