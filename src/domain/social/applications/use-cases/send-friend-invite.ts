import { Either, left, right } from '@/core/either'
import { InviteAlreadyExistsError } from '../errors/invite-already-error'
import { Friendship } from '../../entities/friendship'
import { FriendshipRepository } from '../repositories/friendship-repository'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

interface SendFriendInviteReq {
  senderId: string
  recipientId: string
}

type SendFriendInviteRes = Either<
  ResourceNotFoundError | NotAllowedError | InviteAlreadyExistsError,
  {
    friendship: Friendship
  }
>

export class SendFriendInviteUseCase {
  constructor(
    private friendshipRepository: FriendshipRepository,
    private userRepository: UserRepository
  ) {}

  async execute({
    senderId,
    recipientId,
  }: SendFriendInviteReq): Promise<SendFriendInviteRes> {
    if (senderId === recipientId) {
      return left(new NotAllowedError())
    }

    const sender = await this.userRepository.findById(senderId)

    if (!sender) return left(new ResourceNotFoundError('sender'))

    const recipient = await this.userRepository.findById(recipientId)

    if (!recipient) return left(new ResourceNotFoundError('recipient'))

    const existingFriendship =
      (await this.friendshipRepository.findBySenderIdAndRecipientId(
        senderId,
        recipientId
      )) ??
      (await this.friendshipRepository.findBySenderIdAndRecipientId(
        recipientId,
        senderId
      ))

    if (existingFriendship)
      return left(new InviteAlreadyExistsError('friendship'))

    const friendship = Friendship.create({
      recipientId,
      senderId,
    })

    await this.friendshipRepository.create(friendship)

    return right({
      friendship: friendship,
    })
  }
}
