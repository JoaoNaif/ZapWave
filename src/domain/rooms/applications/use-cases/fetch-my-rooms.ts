import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { MessageRepository } from '@/domain/chat/applications/repositories/message-repository'
import { MyRoomDto } from '../dtos/my-room-dto'

interface FetchMyRoomsReq {
  userId: string
}

type FetchMyRoomsRes = Either<null, { rooms: MyRoomDto[] }>

@Injectable()
export class FetchMyRoomsUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository,
    private messageRepository: MessageRepository
  ) {}

  async execute({ userId }: FetchMyRoomsReq): Promise<FetchMyRoomsRes> {
    // as memberships incluem as DMs; o filtro por type = room vem abaixo
    const memberships =
      await this.conversationMemberRepository.findManyByUserId(userId)

    if (memberships.length === 0) {
      return right({ rooms: [] })
    }

    const membershipByConversationId = new Map(
      memberships.map((membership) => [
        membership.conversationId.toString(),
        membership,
      ])
    )

    const conversations = await this.conversationRepository.findManyByIds([
      ...membershipByConversationId.keys(),
    ])

    const rooms = conversations.filter(
      (conversation) => conversation.type === 'room'
    )

    if (rooms.length === 0) {
      return right({ rooms: [] })
    }

    const roomIds = rooms.map((room) => room.id.toString())

    const [memberCountByRoomId, unreadCountByRoomId] = await Promise.all([
      this.conversationMemberRepository.countManyByConversationIds(roomIds),
      this.messageRepository.countUnreadByConversation(
        userId,
        roomIds.flatMap((roomId) => {
          const membership = membershipByConversationId.get(roomId)

          if (!membership) return []

          return [
            {
              conversationId: roomId,
              lastReadMessageId:
                membership.lastReadMessageId?.toString() ?? null,
              joinedAt: membership.joinedAt,
            },
          ]
        })
      ),
    ])

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
        const membership = membershipByConversationId.get(roomId)

        if (!membership) return []

        return [
          {
            id: roomId,
            // create-room exige name; o null do tipo é só por causa das DMs
            name: room.name ?? '',
            role: membership.role,
            memberCount: memberCountByRoomId.get(roomId) ?? 0,
            lastMessageAt: room.lastMessageAt,
            unreadCount: unreadCountByRoomId.get(roomId) ?? 0,
          },
        ]
      }),
    })
  }
}
