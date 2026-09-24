import { Either, left, right } from '@/core/either'
import { Conversation } from '../../entities/conversation'
import { ConversationMember } from '../../entities/conversation-member'
import { FriendshipRepository } from '@/domain/social/applications/repositories/friendship-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { FriendshipNotAcceptedError } from '../errors/friendship-not-accepted-error'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'
import { ConversationRepository } from '../repositories/conversation-repository'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Injectable } from '@nestjs/common'
import { ConversationDto } from '../dtos/conversation-dto'
import { ConversationMemberDto } from '../dtos/conversation-member-dto'
import { ConversationMapper } from '../mappers/conversation-mapper'

interface OpenDirectConversationReq {
  userId: string
  friendId: string
}

type OpenDirectConversationRes = Either<
  ResourceNotFoundError | FriendshipNotAcceptedError | NotAllowedError,
  {
    conversation: ConversationDto
    member: ConversationMemberDto
    isNewConversation: boolean
  }
>

@Injectable()
export class OpenDirectConversationUseCase {
  constructor(
    private friendshipRepository: FriendshipRepository,
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({
    friendId,
    userId,
  }: OpenDirectConversationReq): Promise<OpenDirectConversationRes> {
    if (userId === friendId) return left(new NotAllowedError())

    const friendship =
      (await this.friendshipRepository.findBySenderIdAndRecipientId(
        userId,
        friendId
      )) ??
      (await this.friendshipRepository.findBySenderIdAndRecipientId(
        friendId,
        userId
      ))

    if (!friendship) return left(new ResourceNotFoundError('friendship'))

    if (!friendship.isAccepted()) return left(new FriendshipNotAcceptedError())

    const userMemberships =
      await this.conversationMemberRepository.findManyByUserId(userId)
    const friendMemberships =
      await this.conversationMemberRepository.findManyByUserId(friendId)

    const friendConversationIds = new Set(
      friendMemberships.map((m) => m.conversationId.toString())
    )

    const sharedConversationIds = userMemberships
      .map((m) => m.conversationId.toString())
      .filter((id) => friendConversationIds.has(id))

    let dmConversation: Conversation | null = null
    let existingMembership: ConversationMember | null = null

    for (const conversationId of sharedConversationIds) {
      const conversation =
        await this.conversationRepository.findById(conversationId)
      if (conversation?.type === 'dm') {
        dmConversation = conversation
        existingMembership =
          userMemberships.find(
            (m) => m.conversationId.toString() === conversationId
          ) ?? null
        break
      }
    }

    if (dmConversation && existingMembership) {
      return right({
        conversation: ConversationMapper.toDto(dmConversation),
        member: ConversationMapper.memberToDto(existingMembership),
        isNewConversation: false,
      })
    }

    // TODO(infra): check-then-act — duas chamadas concorrentes podem passar
    // por aqui ao mesmo tempo e criar 2 DMs pro mesmo par. Conversation.dmKey
    // (prisma/schema.prisma) já tem a constraint única (par normalizado
    // userId+friendId); falta o repositório Prisma calcular esse valor no
    // create() e este use-case capturar a violação pra re-buscar em vez de
    // duplicar.
    const newConversation = Conversation.create({
      type: 'dm',
      name: null,
      createdById: new UniqueEntityId(userId),
    })

    const userMembership = ConversationMember.create({
      conversationId: newConversation.id,
      role: 'member',
      userId: new UniqueEntityId(userId),
      lastReadMessageId: null,
    })

    const friendMembership = ConversationMember.create({
      conversationId: newConversation.id,
      role: 'member',
      userId: new UniqueEntityId(friendId),
      lastReadMessageId: null,
    })

    // atômico: nunca sobra uma DM sem os dois membros (ou só com um)
    await this.conversationRepository.createWithMembers(newConversation, [
      userMembership,
      friendMembership,
    ])

    return right({
      conversation: ConversationMapper.toDto(newConversation),
      member: ConversationMapper.memberToDto(userMembership),
      isNewConversation: true,
    })
  }
}
