import { DomainEvents } from '@/core/events/domain-events'
import { RoomInviteRepository } from '@/domain/rooms/applications/repositories/room-invite-repository'
import { RoomInvite } from '@/domain/rooms/entities/room-invite'
import { Injectable } from '@nestjs/common'
import { StatusRoomInvite } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { PrismaRoomInviteMapper } from '../mappers/prisma-room-invite-mapper'

@Injectable()
export class PrismaRoomInviteRepository implements RoomInviteRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<RoomInvite | null> {
    const roomInvite = await this.prisma.roomInvite.findUnique({
      where: { id },
    })

    if (!roomInvite) {
      return null
    }

    return PrismaRoomInviteMapper.toDomain(roomInvite)
  }

  async findByConversationIdAndInviteeId(
    conversationId: string,
    inviteeId: string
  ): Promise<RoomInvite | null> {
    const roomInvite = await this.prisma.roomInvite.findFirst({
      where: { conversationId, inviteeId },
    })

    if (!roomInvite) {
      return null
    }

    return PrismaRoomInviteMapper.toDomain(roomInvite)
  }

  async findManyByIviteeIdWithStausPending(
    inviteeId: string,
    status: string
  ): Promise<RoomInvite[]> {
    const roomInvites = await this.prisma.roomInvite.findMany({
      where: {
        inviteeId,
        status: status.toUpperCase() as StatusRoomInvite,
      },
    })

    return roomInvites.map(PrismaRoomInviteMapper.toDomain)
  }

  async create(roomInvite: RoomInvite): Promise<void> {
    const data = PrismaRoomInviteMapper.toPrisma(roomInvite)

    await this.prisma.roomInvite.create({
      data,
    })

    DomainEvents.dispatchEventsForAggregate(roomInvite.id)
  }

  async save(roomInvite: RoomInvite): Promise<void> {
    const data = PrismaRoomInviteMapper.toPrisma(roomInvite)

    await this.prisma.roomInvite.update({
      where: { id: roomInvite.id.toString() },
      data,
    })

    DomainEvents.dispatchEventsForAggregate(roomInvite.id)
  }

  async delete(roomInvite: RoomInvite): Promise<void> {
    await this.prisma.roomInvite.delete({
      where: { id: roomInvite.id.toString() },
    })
  }
}
