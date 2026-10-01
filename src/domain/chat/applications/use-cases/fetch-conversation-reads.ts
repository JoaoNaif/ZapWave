import { Either, left, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'
import { ConversationReadDto } from '../dtos/conversation-read-dto'

interface FetchConversationReadsReq {
  userId: string
  conversationId: string
}

type FetchConversationReadsRes = Either<
  ResourceNotFoundError,
  { reads: ConversationReadDto[] }
>

@Injectable()
export class FetchConversationReadsUseCase {
  constructor(
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({
    userId,
    conversationId,
  }: FetchConversationReadsReq): Promise<FetchConversationReadsRes> {
    const members =
      await this.conversationMemberRepository.findManyByConversationId(
        conversationId
      )

    // quem não é membro recebe o mesmo 404 de uma conversa inexistente
    const isMember = members.some(
      (member) => member.userId.toString() === userId
    )

    if (!isMember) {
      return left(new ResourceNotFoundError('conversation'))
    }

    // o meu cursor fica de fora: o front já sabe o que ele mesmo leu
    const reads = members
      .filter((member) => member.userId.toString() !== userId)
      .map((member) => ({
        userId: member.userId.toString(),
        lastReadMessageId: member.lastReadMessageId?.toString() ?? null,
      }))

    return right({ reads })
  }
}
