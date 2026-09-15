import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { RoomInvite } from '@/domain/rooms/entities/room-invite'
import { Prisma, RoomInvite as PrismaRoomInvite } from '@prisma/client'

export class PrismaRoomInviteMapper {
  static toDomain(raw: PrismaRoomInvite): RoomInvite {
    return RoomInvite.create(
      {
        conversationId: new UniqueEntityId(raw.conversationId),
        inviterId: new UniqueEntityId(raw.inviterId),
        inviteeId: new UniqueEntityId(raw.inviteeId),
        status: raw.status.toLowerCase() as
          | 'pending'
          | 'accepted'
          | 'declined'
          | 'revoked',
        createdAt: raw.createdAt,
        respondedAt: raw.respondedAt,
      },
      new UniqueEntityId(raw.id)
    )
  }

  static toPrisma(
    roomInvite: RoomInvite
  ): Prisma.RoomInviteUncheckedCreateInput {
    return {
      id: roomInvite.id.toString(),
      conversationId: roomInvite.conversationId.toString(),
      inviterId: roomInvite.inviterId.toString(),
      inviteeId: roomInvite.inviteeId.toString(),
      status: roomInvite.status.toUpperCase() as Prisma.RoomInviteUncheckedCreateInput['status'],
      createdAt: roomInvite.createdAt,
      respondedAt: roomInvite.respondedAt,
    }
  }
}
