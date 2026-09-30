import { Either, left, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { Injectable } from '@nestjs/common'

interface DemoteAdminReq {
  conversationId: string
  actorId: string
  targetUserId: string
}

type DemoteAdminRes = Either<ResourceNotFoundError | NotAllowedError, null>

@Injectable()
export class DemoteAdminUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({
    conversationId,
    actorId,
    targetUserId,
  }: DemoteAdminReq): Promise<DemoteAdminRes> {
    const conversation =
      await this.conversationRepository.findById(conversationId)

    if (!conversation) return left(new ResourceNotFoundError('conversation'))

    if (conversation.type !== 'room')
      return left(new ResourceNotFoundError('room'))

    const actor =
      await this.conversationMemberRepository.findByUserWithConversationId(
        actorId,
        conversationId
      )

    if (!actor) return left(new ResourceNotFoundError('conversation member'))

    // Só o owner rebaixa, pelo mesmo motivo que só ele promove: admin não mexe
    // em outro admin (ver promote-to-admin).
    if (actor.role !== 'owner') return left(new NotAllowedError())

    const target =
      await this.conversationMemberRepository.findByUserWithConversationId(
        targetUserId,
        conversationId
      )

    if (!target) return left(new ResourceNotFoundError('conversation member'))

    // o owner (inclusive o próprio actor) não "desce" pra member
    if (target.role === 'owner') return left(new NotAllowedError())

    // já é member: nada muda, e um clique duplo no front não vira erro
    if (target.role === 'member') return right(null)

    target.role = 'member'

    await this.conversationMemberRepository.save(target)

    return right(null)
  }
}
