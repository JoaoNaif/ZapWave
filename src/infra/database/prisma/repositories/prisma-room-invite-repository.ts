import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { DomainEvents } from '@/core/events/domain-events'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { RoomInviteRepository } from '@/domain/rooms/applications/repositories/room-invite-repository'
import { RoomInvite } from '@/domain/rooms/entities/room-invite'
import { Injectable } from '@nestjs/common'
import { Prisma, StatusRoomInvite } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { PrismaRoomInviteMapper } from '../mappers/prisma-room-invite-mapper'
import { PrismaConversationMemberMapper } from '../mappers/prisma-conversation-member-mapper'

// P2002 = violação de constraint única: já existe convite pra esse par
// (conversationId, inviteeId).
const UNIQUE_VIOLATION = 'P2002'

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

    try {
      await this.prisma.roomInvite.create({
        data,
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ResourceAlreadyExistsError('room invite')
      }

      throw error
    }

    DomainEvents.dispatchEventsForAggregate(roomInvite.id)
  }

  // $transaction([...]): as duas escritas vão juntas ou nenhuma vai. O
  // dispatch dos eventos fica DEPOIS — só notifica algo que de fato gravou.
  async acceptWithMember(
    invite: RoomInvite,
    member: ConversationMember
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.conversationMember.create({
        data: PrismaConversationMemberMapper.toPrisma(member),
      }),
      this.prisma.roomInvite.update({
        where: { id: invite.id.toString() },
        data: PrismaRoomInviteMapper.toPrisma(invite),
      }),
    ])

    DomainEvents.dispatchEventsForAggregate(invite.id)
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
