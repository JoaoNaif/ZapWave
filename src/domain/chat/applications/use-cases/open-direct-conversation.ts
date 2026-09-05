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

interface OpenDirectConversationReq {
  userId: string
  friendId: string
}

type OpenDirectConversationRes = Either<
  ResourceNotFoundError | FriendshipNotAcceptedError | NotAllowedError,
  {
    conversation: Conversation
    member: ConversationMember
    isNewConversation: boolean
  }
>

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
        conversation: dmConversation,
        member: existingMembership,
        isNewConversation: false,
      })
    }

    // TODO(infra): check-then-act — duas chamadas concorrentes podem passar
    // por aqui ao mesmo tempo e criar 2 DMs pro mesmo par. Resolver com
    // constraint única (par normalizado userA+userB) no schema do Prisma e
    // capturar a violação aqui pra re-buscar em vez de duplicar.
    //
    // TODO(infra): create() da Conversation + dos 2 ConversationMember são
    // 3 escritas separadas — se o processo cair no meio, sobra Conversation
    // órfã sem membro. Envolver num $transaction do Prisma (ou um método
    // tipo createWithMembers) quando o PrismaConversationRepository existir.
    const newConversation = Conversation.create({
      type: 'dm',
      name: null,
      createdById: new UniqueEntityId(userId),
    })

    await this.conversationRepository.create(newConversation)

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

    await this.conversationMemberRepository.create(userMembership)
    await this.conversationMemberRepository.create(friendMembership)

    return right({
      conversation: newConversation,
      member: userMembership,
      isNewConversation: true,
    })
  }
}
