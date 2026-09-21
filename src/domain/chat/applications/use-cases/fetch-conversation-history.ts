import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { Injectable } from '@nestjs/common'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'
import { MessageRepository } from '../repositories/message-repository'
import { MessageDto } from '../dtos/message-dto'
import { MessageMapper } from '../mappers/message-mapper'

interface FetchConversationHistoryReq {
  userId: string
  conversationId: string
  before?: string
  limit?: number
}

type FetchConversationHistoryRes = Either<
  ResourceNotFoundError,
  {
    messages: MessageDto[]
    hasMore: boolean
  }
>

@Injectable()
export class FetchConversationHistoryUseCase {
  constructor(
    private conversationMemberRepository: ConversationMemberRepository,
    private messageRepository: MessageRepository
  ) {}

  async execute({
    conversationId,
    userId,
    before,
    limit = 50,
  }: FetchConversationHistoryReq): Promise<FetchConversationHistoryRes> {
    const conversationMember =
      await this.conversationMemberRepository.findByUserWithConversationId(
        userId,
        conversationId
      )

    if (!conversationMember) {
      return left(new ResourceNotFoundError('conversation'))
    }

    const messages = await this.messageRepository.findManyByConversationId(
      conversationId,
      {
        before,
        limit: limit + 1,
      }
    )

    const hasMore = messages.length > limit

    return right({
      messages: (hasMore ? messages.slice(0, limit) : messages).map(
        MessageMapper.toDto
      ),
      hasMore,
    })
  }
}
