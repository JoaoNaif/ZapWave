import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { MyRoomDto } from '../dtos/my-room-dto'

interface FetchMyRoomsReq {
  userId: string
}

type FetchMyRoomsRes = Either<null, { rooms: MyRoomDto[] }>

@Injectable()
export class FetchMyRoomsUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({ userId }: FetchMyRoomsReq): Promise<FetchMyRoomsRes> {
    // as memberships incluem as DMs; o filtro por type = room vem abaixo
    const memberships =
      await this.conversationMemberRepository.findManyByUserId(userId)

    if (memberships.length === 0) {
      return right({ rooms: [] })
    }

    const roleByConversationId = new Map(
      memberships.map((membership) => [
        membership.conversationId.toString(),
        membership.role,
      ])
    )

    const conversations = await this.conversationRepository.findManyByIds([
      ...roleByConversationId.keys(),
    ])

    const rooms = conversations.filter(
      (conversation) => conversation.type === 'room'
    )

    if (rooms.length === 0) {
      return right({ rooms: [] })
    }

    const memberCountByRoomId =
      await this.conversationMemberRepository.countManyByConversationIds(
        rooms.map((room) => room.id.toString())
      )

    // última atividade primeiro: a última mensagem ou, se a sala ainda não
    // tem nenhuma, a criação — assim a sala recém-criada aparece no topo
    const lastActivity = (room: (typeof rooms)[number]) =>
      (room.lastMessageAt ?? room.createdAt).getTime()

    const sortedRooms = [...rooms].sort(
      (a, b) => lastActivity(b) - lastActivity(a)
    )

    return right({
      rooms: sortedRooms.flatMap((room) => {
        const roomId = room.id.toString()
        const role = roleByConversationId.get(roomId)

        if (!role) return []

        return [
          {
            id: roomId,
            // create-room exige name; o null do tipo é só por causa das DMs
            name: room.name ?? '',
            role,
            memberCount: memberCountByRoomId.get(roomId) ?? 0,
            lastMessageAt: room.lastMessageAt,
          },
        ]
      }),
    })
  }
}
