import { Either, left, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

interface LeaveRoomReq {
  conversationId: string
  userId: string
}

type LeaveRoomRes = Either<ResourceNotFoundError | NotAllowedError, null>

export class LeaveRoomUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({
    conversationId,
    userId,
  }: LeaveRoomReq): Promise<LeaveRoomRes> {
    const conversation =
      await this.conversationRepository.findById(conversationId)

    if (!conversation) return left(new ResourceNotFoundError('conversation'))

    if (conversation.type !== 'room')
      return left(new ResourceNotFoundError('room'))

    const member =
      await this.conversationMemberRepository.findByUserWithConversationId(
        userId,
        conversationId
      )

    if (!member) return left(new ResourceNotFoundError('conversation member'))

    // Decisão (docs/03 §7): o owner não pode simplesmente sair — teria que
    // transferir o dono antes (use-case ainda não existe). Por enquanto,
    // bloqueia a saída.
    if (member.role === 'owner') return left(new NotAllowedError())

    await this.conversationMemberRepository.delete(member)

    return right(null)
  }
}
