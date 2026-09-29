import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { FriendshipRepository } from '../repositories/friendship-repository'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { UserMapper } from '@/domain/accounts/applications/mappers/user-mapper'
import { Presence } from '@/domain/chat/applications/gateways/presence'
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

    const users = await this.userRepository.findManyByIds(friendIds)

    const friends = await Promise.all(
      users.map(async (user) => ({
        ...UserMapper.toSummaryDto(user),
        online: await this.presence.isOnline(user.id.toString()),
      }))
    )

    friends.sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'))

    return right({ friends })
  }
}
