import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Friendship } from '@/domain/social/entities/friendship'
import { Prisma, Friendship as PrismaFriendship } from '@prisma/client'

export class PrismaFriendshipMapper {
  static toDomain(raw: PrismaFriendship): Friendship {
    return Friendship.create(
      {
        senderId: raw.senderId,
        recipientId: raw.recipientId,
        status: raw.status.toLowerCase() as
          | 'pending'
          | 'accepted'
          | 'rejected',
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      },
      new UniqueEntityId(raw.id)
    )
  }

  static toPrisma(
    friendship: Friendship
  ): Prisma.FriendshipUncheckedCreateInput {
    return {
      id: friendship.id.toString(),
      senderId: friendship.senderId,
      recipientId: friendship.recipientId,
      // par normalizado (menor:maior) — garante a unicidade do par mesmo se
      // quem mandou o pedido variar (ver Friendship.pairKey no domínio).
      pairKey: friendship.pairKey,
      status: friendship.status.toUpperCase() as Prisma.FriendshipUncheckedCreateInput['status'],
      createdAt: friendship.createdAt,
      updatedAt: friendship.updatedAt,
    }
  }
}
