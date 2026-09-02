import { Friendship } from '../../entities/friendship'

export abstract class FriendshipRepository {
  abstract findById(id: string): Promise<Friendship | null>
  abstract findBySenderIdAndRecipientId(
    senderId: string,
    recipientId: string
  ): Promise<Friendship | null>
  abstract create(friendship: Friendship): Promise<void>
  abstract save(friendship: Friendship): Promise<void>
  abstract delete(friendship: Friendship): Promise<void>
}
