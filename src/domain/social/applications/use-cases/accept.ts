import { Either, left, right } from '@/core/either'
import { FriendshipRepository } from '../repositories/friendship-repository'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { Injectable } from '@nestjs/common'

interface AcceptReq {
  userId: string
  friendshipId: string
}

type AcceptRes = Either<ResourceNotFoundError | NotAllowedError, null>

@Injectable()
export class AcceptUseCase {
  constructor(
    private friendshipRepository: FriendshipRepository,
    private userRepository: UserRepository
  ) {}

  async execute({ friendshipId, userId }: AcceptReq): Promise<AcceptRes> {
    const user = await this.userRepository.findById(userId)

    if (!user) return left(new ResourceNotFoundError('user'))

    const friendship = await this.friendshipRepository.findById(friendshipId)

    if (!friendship) return left(new ResourceNotFoundError('friendship'))

    if (friendship.recipientId !== userId) {
      return left(new NotAllowedError())
    }

    if (!friendship.isPending()) {
      return left(new NotAllowedError())
    }

    friendship.accept()

    await this.friendshipRepository.save(friendship)

    return right(null)
  }
}
