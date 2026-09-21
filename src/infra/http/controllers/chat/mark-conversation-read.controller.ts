import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Put,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { MarkConversationReadUseCase } from '@/domain/chat/applications/use-cases/mark-conversation-read'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

const markConversationReadBodySchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().ulid(),
})

type MarkConversationReadBodySchema = z.infer<
  typeof markConversationReadBodySchema
>

@Controller()
export class MarkConversationReadController {
  constructor(private markConversationRead: MarkConversationReadUseCase) {}

  @Put('/mark-conversation')
  @HttpCode(200)
  async handle(
    @Body(new ZodValidationPipe(markConversationReadBodySchema))
    body: MarkConversationReadBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { conversationId, messageId } = body

    const result = await this.markConversationRead.execute({
      userId,
      messageId,
      conversationId,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { read } = result.value

    return {
      read,
    }
  }
}
