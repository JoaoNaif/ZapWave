import { Either, left, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { UserMapper } from '@/domain/accounts/applications/mappers/user-mapper'
import { RoomMemberSummaryDto } from '../dtos/room-member-summary-dto'

interface FetchRoomMembersReq {
  userId: string
  roomId: string
}

type FetchRoomMembersRes = Either<
  ResourceNotFoundError,
  { members: RoomMemberSummaryDto[] }
>

const ROLE_ORDER = { owner: 0, admin: 1, member: 2 }

@Injectable()
export class FetchRoomMembersUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository,
    private userRepository: UserRepository
  ) {}

  async execute({
    userId,
    roomId,
  }: FetchRoomMembersReq): Promise<FetchRoomMembersRes> {
    const room = await this.conversationRepository.findById(roomId)

    if (!room || room.type !== 'room') {
      return left(new ResourceNotFoundError('room'))
    }

    const members =
      await this.conversationMemberRepository.findManyByConversationId(roomId)

    // Quem não é membro recebe o mesmo "não encontrado" de uma sala que não
    // existe: a rota não confirma pra estranhos que aquele id é uma sala.
    const isMember = members.some(
      (member) => member.userId.toString() === userId
    )

    if (!isMember) {
      return left(new ResourceNotFoundError('room'))
    }

    const users = await this.userRepository.findManyByIds(
      members.map((member) => member.userId.toString())
    )

    const roleByUserId = new Map(
      members.map((member) => [member.userId.toString(), member.role])
    )

    const summaries = users.flatMap((user) => {
      const role = roleByUserId.get(user.id.toString())

      if (!role) return []

      return [{ ...UserMapper.toSummaryDto(user), role }]
    })

    // owner, depois admins, depois members; dentro de cada papel, alfabético
    summaries.sort(
      (a, b) =>
        ROLE_ORDER[a.role] - ROLE_ORDER[b.role] ||
        a.displayName.localeCompare(b.displayName, 'pt-BR')
    )

    return right({ members: summaries })
  }
}
