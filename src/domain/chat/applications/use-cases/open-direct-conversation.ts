import { Either, left, right } from '@/core/either'
import { Conversation } from '../../entities/conversation'
import { ConversationMember } from '../../entities/conversation-member'
import { FriendshipRepository } from '@/domain/social/applications/repositories/friendship-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
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

    const existing = await this.findExistingDirectConversation(userId, friendId)

    if (existing) {
      return right({
        conversation: ConversationMapper.toDto(existing.conversation),
        member: ConversationMapper.memberToDto(existing.member),
        isNewConversation: false,
      })
    }

    const newConversation = Conversation.create({
      type: 'dm',
      name: null,
      createdById: new UniqueEntityId(userId),
      dmKey: Conversation.dmKeyFor(userId, friendId),
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

    try {
      // atômico: nunca sobra uma DM sem os dois membros (ou só com um)
      await this.conversationRepository.createWithMembers(newConversation, [
        userMembership,
        friendMembership,
      ])
    } catch (error) {
      if (!(error instanceof ResourceAlreadyExistsError)) throw error

      // A checagem acima não segura dois pedidos simultâneos (os dois não
      // acham DM e os dois tentam criar). Quem segura é a constraint única
      // do dm_key: o segundo create falha, e aqui devolvemos a DM que o
      // primeiro acabou de gravar — os dois pedidos acabam com a mesma DM.
      const winner = await this.findExistingDirectConversation(userId, friendId)

      if (!winner) throw error

      return right({
        conversation: ConversationMapper.toDto(winner.conversation),
        member: ConversationMapper.memberToDto(winner.member),
        isNewConversation: false,
      })
    }

    return right({
      conversation: ConversationMapper.toDto(newConversation),
      member: ConversationMapper.memberToDto(userMembership),
      isNewConversation: true,
    })
  }

  private async findExistingDirectConversation(
    userId: string,
    friendId: string
  ): Promise<{
    conversation: Conversation
    member: ConversationMember
  } | null> {
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

    for (const conversationId of sharedConversationIds) {
      const conversation =
        await this.conversationRepository.findById(conversationId)

      if (conversation?.type !== 'dm') continue

      const member = userMemberships.find(
        (m) => m.conversationId.toString() === conversationId
      )

      if (member) return { conversation, member }
    }

    return null
  }
}
