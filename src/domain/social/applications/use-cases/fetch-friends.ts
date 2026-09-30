import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { FriendshipRepository } from '../repositories/friendship-repository'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { UserMapper } from '@/domain/accounts/applications/mappers/user-mapper'
import { Presence } from '@/domain/chat/applications/gateways/presence'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { MessageRepository } from '@/domain/chat/applications/repositories/message-repository'
import { Conversation } from '@/domain/chat/entities/conversation'
import { FriendDto } from '../dtos/friend-dto'

interface FetchFriendsReq {
  userId: string
}

type FetchFriendsRes = Either<null, { friends: FriendDto[] }>

@Injectable()
export class FetchFriendsUseCase {
  constructor(
    private friendshipRepository: FriendshipRepository,
    private userRepository: UserRepository,
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository,
    private messageRepository: MessageRepository,
    private presence: Presence
  ) {}

  async execute({ userId }: FetchFriendsReq): Promise<FetchFriendsRes> {
    const friendships =
      await this.friendshipRepository.findManyAcceptedByUserId(userId)

    // a amizade não tem direção depois de aceita: o amigo é "o outro lado"
    const friendIds = friendships.map((friendship) =>
      friendship.senderId === userId
        ? friendship.recipientId
        : friendship.senderId
    )

    if (friendIds.length === 0) {
      return right({ friends: [] })
    }

    const [users, dms, memberships] = await Promise.all([
      this.userRepository.findManyByIds(friendIds),
      this.conversationRepository.findManyByDmKeys(
        friendIds.map((friendId) => Conversation.dmKeyFor(userId, friendId))
      ),
      this.conversationMemberRepository.findManyByUserId(userId),
    ])

    const dmIds = new Set(dms.map((dm) => dm.id.toString()))

    // o cursor de leitura é do MEU membro em cada DM
    const unreadCountByDmId =
      await this.messageRepository.countUnreadByConversation(
        userId,
        memberships
          .filter((membership) =>
            dmIds.has(membership.conversationId.toString())
          )
          .map((membership) => ({
            conversationId: membership.conversationId.toString(),
            lastReadMessageId: membership.lastReadMessageId?.toString() ?? null,
            joinedAt: membership.joinedAt,
          }))
      )

    const dmByDmKey = new Map(dms.map((dm) => [dm.dmKey, dm]))

    const friends = await Promise.all(
      users.map(async (user) => {
        const dm = dmByDmKey.get(
          Conversation.dmKeyFor(userId, user.id.toString())
        )

        return {
          ...UserMapper.toSummaryDto(user),
          online: await this.presence.isOnline(user.id.toString()),
          lastMessageAt: dm?.lastMessageAt ?? null,
          unreadCount: dm ? (unreadCountByDmId.get(dm.id.toString()) ?? 0) : 0,
        }
      })
    )

    // última interação primeiro (mensagem enviada OU recebida na DM); quem
    // nunca trocou mensagem vai pro fim, em ordem alfabética
    friends.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt) {
        return b.lastMessageAt.getTime() - a.lastMessageAt.getTime()
      }
      if (a.lastMessageAt) return -1
      if (b.lastMessageAt) return 1

      return a.displayName.localeCompare(b.displayName, 'pt-BR')
    })

    return right({ friends })
  }
}
