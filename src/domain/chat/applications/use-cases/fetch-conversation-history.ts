import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { Injectable } from '@nestjs/common'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'
import { MessageRepository } from '../repositories/message-repository'
import { MessageDto } from '../dtos/message-dto'
import { MessageMapper } from '../mappers/message-mapper'
import { toReplyPreview } from '../mappers/reply-preview-mapper'

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
    const page = hasMore ? messages.slice(0, limit) : messages

    // uma consulta só para todas as originais da página
    const replyToIds = [
      ...new Set(
        page.flatMap((message) =>
          message.replyToId ? [message.replyToId.toString()] : []
        )
      ),
    ]
    const originals = new Map(
      (await this.messageRepository.findManyByIds(replyToIds)).map(
        (original) => [original.id.toString(), original]
      )
    )

    for (const message of page) {
      const original = message.replyToId
        ? originals.get(message.replyToId.toString())
        : undefined

      if (original) message.replyTo = toReplyPreview(original)
    }

    return right({
      messages: page.map(MessageMapper.toDto),
      hasMore,
    })
  }
}
