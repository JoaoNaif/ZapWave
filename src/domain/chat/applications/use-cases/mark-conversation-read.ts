import { Either, left, right } from '@/core/either'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'

interface MarkConversationReadReq {
  userId: string
  conversationId: string
  messageId: string
}

type MarkConversationReadRes = Either<ResourceNotFoundError, { read: boolean }>

export class MarkConversationReadUseCase {
  constructor(
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({
    conversationId,
    messageId,
    userId,
  }: MarkConversationReadReq): Promise<MarkConversationReadRes> {
    const conversationMember =
      await this.conversationMemberRepository.findByUserWithConversationId(
        userId,
        conversationId
      )

    if (!conversationMember)
      return left(new ResourceNotFoundError('conversation'))

    const isOlderThanCurrentCursor =
      conversationMember.lastReadMessageId !== null &&
      messageId < conversationMember.lastReadMessageId.toString()

    if (isOlderThanCurrentCursor) {
      return right({ read: false })
    }

    conversationMember.lastReadMessageId = new UniqueEntityId(messageId)
    await this.conversationMemberRepository.save(conversationMember)

    return right({ read: true })
  }
}
