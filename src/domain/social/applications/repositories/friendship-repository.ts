import { Friendship } from '../../entities/friendship'

export abstract class FriendshipRepository {
  abstract findById(id: string): Promise<Friendship | null>
  abstract findBySenderIdAndRecipientId(
    senderId: string,
    recipientId: string
  ): Promise<Friendship | null>
  // amizades já aceitas em que o usuário é sender OU recipient
  abstract findManyAcceptedByUserId(userId: string): Promise<Friendship[]>
  // pedidos que o usuário recebeu e ainda não respondeu, mais recentes primeiro
  abstract findManyPendingByRecipientId(
    recipientId: string
  ): Promise<Friendship[]>
  abstract create(friendship: Friendship): Promise<void>
  abstract save(friendship: Friendship): Promise<void>
  abstract delete(friendship: Friendship): Promise<void>
}
