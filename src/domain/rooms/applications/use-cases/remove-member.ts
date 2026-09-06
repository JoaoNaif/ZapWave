import { Either, left, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

interface RemoveMemberReq {
  conversationId: string
  actorId: string
  targetUserId: string
}

type RemoveMemberRes = Either<ResourceNotFoundError | NotAllowedError, null>

export class RemoveMemberUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({
    conversationId,
    actorId,
    targetUserId,
  }: RemoveMemberReq): Promise<RemoveMemberRes> {
    const conversation =
      await this.conversationRepository.findById(conversationId)

    if (!conversation) return left(new ResourceNotFoundError('conversation'))

    if (conversation.type !== 'room')
      return left(new ResourceNotFoundError('room'))

    // Sair da própria sala é o leave-room; aqui é sempre remover outra pessoa.
    if (actorId === targetUserId) return left(new NotAllowedError())

    const actor =
      await this.conversationMemberRepository.findByUserWithConversationId(
        actorId,
        conversationId
      )

    if (!actor) return left(new ResourceNotFoundError('conversation member'))

    if (actor.role !== 'owner' && actor.role !== 'admin')
      return left(new NotAllowedError())

    const target =
      await this.conversationMemberRepository.findByUserWithConversationId(
        targetUserId,
        conversationId
      )

    if (!target) return left(new ResourceNotFoundError('conversation member'))

    // O owner nunca é removido; um admin só pode remover member (não outro
    // admin nem o owner).
    if (target.role === 'owner') return left(new NotAllowedError())

    if (actor.role === 'admin' && target.role === 'admin')
      return left(new NotAllowedError())

    await this.conversationMemberRepository.delete(target)

    return right(null)
  }
}
