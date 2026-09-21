import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common'
import z from 'zod'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { FetchConversationHistoryUseCase } from '@/domain/chat/applications/use-cases/fetch-conversation-history'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'

const conversationParamSchema = z.string().uuid()

const fetchConversationHistoryQuerySchema = z.object({
  before: z.string().ulid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

type FetchConversationHistoryQuerySchema = z.infer<
  typeof fetchConversationHistoryQuerySchema
>

@Controller('/conversation-history')
export class FetchConversationHistoryController {
  constructor(
    private fetchConversationHistory: FetchConversationHistoryUseCase
  ) {}

  @Get('/:conversation')
  async handle(
    @Param('conversation', new ZodValidationPipe(conversationParamSchema))
    conversationId: string,
    @Query(new ZodValidationPipe(fetchConversationHistoryQuerySchema))
    query: FetchConversationHistoryQuerySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { before, limit } = query

    const result = await this.fetchConversationHistory.execute({
      userId,
      conversationId,
      before,
      limit,
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

    const { messages, hasMore } = result.value

    return {
      messages,
      hasMore,
    }
  }
}
