import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { FriendshipRepository } from '../repositories/friendship-repository'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { UserMapper } from '@/domain/accounts/applications/mappers/user-mapper'
import { Presence } from '@/domain/chat/applications/gateways/presence'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
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

    const [users, dms] = await Promise.all([
      this.userRepository.findManyByIds(friendIds),
      this.conversationRepository.findManyByDmKeys(
        friendIds.map((friendId) => Conversation.dmKeyFor(userId, friendId))
      ),
    ])

    const lastMessageAtByDmKey = new Map(
      dms.map((dm) => [dm.dmKey, dm.lastMessageAt])
    )

    const friends = await Promise.all(
      users.map(async (user) => ({
        ...UserMapper.toSummaryDto(user),
        online: await this.presence.isOnline(user.id.toString()),
        lastMessageAt:
          lastMessageAtByDmKey.get(
            Conversation.dmKeyFor(userId, user.id.toString())
          ) ?? null,
      }))
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
