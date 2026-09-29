import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { RoomInviteRepository } from '../repositories/room-invite-repository'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { UserMapper } from '@/domain/accounts/applications/mappers/user-mapper'
import { ReceivedRoomInviteDto } from '../dtos/received-room-invite-dto'

interface FetchRoomInvitesReq {
  userId: string
}

type FetchRoomInvitesRes = Either<
  null,
  { roomInvites: ReceivedRoomInviteDto[] }
>

@Injectable()
export class FetchRoomInvitesUseCase {
  constructor(
    private roomInviteRepository: RoomInviteRepository,
    private conversationRepository: ConversationRepository,
    private userRepository: UserRepository
  ) {}

  async execute({ userId }: FetchRoomInvitesReq): Promise<FetchRoomInvitesRes> {
    const invites =
      await this.roomInviteRepository.findManyPendingByInviteeId(userId)

    if (invites.length === 0) {
      return right({ roomInvites: [] })
    }

    const [rooms, inviters] = await Promise.all([
      this.conversationRepository.findManyByIds(
        invites.map((invite) => invite.conversationId.toString())
      ),
      this.userRepository.findManyByIds(
        invites.map((invite) => invite.inviterId.toString())
      ),
    ])

    const roomById = new Map(rooms.map((room) => [room.id.toString(), room]))
    const inviterById = new Map(
      inviters.map((inviter) => [inviter.id.toString(), inviter])
    )

    // mantém a ordem do repositório (mais recente primeiro)
    const roomInvites = invites.flatMap((invite) => {
      const room = roomById.get(invite.conversationId.toString())
      const inviter = inviterById.get(invite.inviterId.toString())

      if (!room || !inviter) return []

      return [
        {
          inviteId: invite.id.toString(),
          room: {
            id: room.id.toString(),
            // create-room exige name; o null do tipo é só por causa das DMs
            name: room.name ?? '',
          },
          inviter: UserMapper.toSummaryDto(inviter),
          createdAt: invite.createdAt,
        },
      ]
    })

    return right({ roomInvites })
  }
}
