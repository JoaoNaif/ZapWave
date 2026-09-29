import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { FriendshipRepository } from '../repositories/friendship-repository'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { UserMapper } from '@/domain/accounts/applications/mappers/user-mapper'
import { FriendRequestDto } from '../dtos/friend-request-dto'

interface FetchFriendRequestsReq {
  userId: string
}

type FetchFriendRequestsRes = Either<
  null,
  { friendRequests: FriendRequestDto[] }
>

@Injectable()
export class FetchFriendRequestsUseCase {
  constructor(
    private friendshipRepository: FriendshipRepository,
    private userRepository: UserRepository
  ) {}

  async execute({
    userId,
  }: FetchFriendRequestsReq): Promise<FetchFriendRequestsRes> {
    const friendships =
      await this.friendshipRepository.findManyPendingByRecipientId(userId)

    if (friendships.length === 0) {
      return right({ friendRequests: [] })
    }

    const senders = await this.userRepository.findManyByIds(
      friendships.map((friendship) => friendship.senderId)
    )

    const senderById = new Map(
      senders.map((sender) => [sender.id.toString(), sender])
    )

    // mantém a ordem do repositório (mais recente primeiro)
    const friendRequests = friendships.flatMap((friendship) => {
      const sender = senderById.get(friendship.senderId)

      if (!sender) return []

      return [
        {
          friendshipId: friendship.id.toString(),
          sender: UserMapper.toSummaryDto(sender),
          createdAt: friendship.createdAt,
        },
      ]
    })

    return right({ friendRequests })
  }
}
