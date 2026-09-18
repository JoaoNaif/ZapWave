import { Friendship } from '../../entities/friendship'
import { FriendshipDto } from '../dtos/friendship-dto'

export class FriendshipMapper {
  static toDto(friendship: Friendship): FriendshipDto {
    return {
      id: friendship.id.toString(),
      senderId: friendship.senderId,
      recipientId: friendship.recipientId,
      status: friendship.status,
      createdAt: friendship.createdAt,
      updatedAt: friendship.updatedAt,
    }
  }
}
