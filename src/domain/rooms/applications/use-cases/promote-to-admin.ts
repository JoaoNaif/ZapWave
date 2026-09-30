import { Either, left, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { Injectable } from '@nestjs/common'

interface PromoteToAdminReq {
  conversationId: string
  actorId: string
  targetUserId: string
}

type PromoteToAdminRes = Either<ResourceNotFoundError | NotAllowedError, null>

@Injectable()
export class PromoteToAdminUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({
    conversationId,
    actorId,
    targetUserId,
  }: PromoteToAdminReq): Promise<PromoteToAdminRes> {
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

    // Só o owner promove. Se admin pudesse promover, um admin criaria outros
    // admins que ele mesmo não consegue remover (admin não remove admin).
    if (actor.role !== 'owner') return left(new NotAllowedError())

    const target =
      await this.conversationMemberRepository.findByUserWithConversationId(
        targetUserId,
        conversationId
      )

    if (!target) return left(new ResourceNotFoundError('conversation member'))

    // o owner (inclusive o próprio actor) não "desce" pra admin
    if (target.role === 'owner') return left(new NotAllowedError())

    // já é admin: nada muda, e um clique duplo no front não vira erro
    if (target.role === 'admin') return right(null)

    target.role = 'admin'

    await this.conversationMemberRepository.save(target)

    return right(null)
  }
}
