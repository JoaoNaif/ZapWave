import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { FetchConversationReadsUseCase } from '@/domain/chat/applications/use-cases/fetch-conversation-reads'

const conversationIdParamSchema = z.string().uuid()

@Controller('/conversations')
export class FetchConversationReadsController {
  constructor(private fetchConversationReads: FetchConversationReadsUseCase) {}

  @Get('/:id/reads')
  async handle(
    @Param('id', new ZodValidationPipe(conversationIdParamSchema))
    conversationId: string,
    @CurrentUser() user: UserPayload
  ) {
    const result = await this.fetchConversationReads.execute({
      userId: user.sub,
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

    const { reads } = result.value

    return { reads }
  }
}
