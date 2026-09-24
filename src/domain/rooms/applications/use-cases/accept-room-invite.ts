import { Either, left, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { RoomInviteRepository } from '../repositories/room-invite-repository'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Injectable } from '@nestjs/common'
import { RoomDto } from '../dtos/room-dto'
import { RoomMemberDto } from '../dtos/room-member-dto'
import { RoomInviteDto } from '../dtos/room-invite-dto'
import { RoomMapper } from '../mappers/room-mapper'

interface AcceptRoomInviteReq {
  inviteId: string
  userId: string
}

type AcceptRoomInviteRes = Either<
  ResourceNotFoundError | NotAllowedError | ResourceAlreadyExistsError,
  { invite: RoomInviteDto; room: RoomDto; member: RoomMemberDto }
>

@Injectable()
export class AcceptRoomInviteUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository,
    private roomInviteRepository: RoomInviteRepository
  ) {}

  async execute({
    inviteId,
    userId,
  }: AcceptRoomInviteReq): Promise<AcceptRoomInviteRes> {
    const invite = await this.roomInviteRepository.findById(inviteId)

    if (!invite) return left(new ResourceNotFoundError('room invite'))

    if (invite.inviteeId.toString() !== userId)
      return left(new NotAllowedError())

    if (invite.status !== 'pending') return left(new NotAllowedError())

    const conversation = await this.conversationRepository.findById(
      invite.conversationId.toString()
    )

    if (!conversation) return left(new ResourceNotFoundError('conversation'))

    const isAlreadyMember =
      await this.conversationMemberRepository.findByUserWithConversationId(
        userId,
        invite.conversationId.toString()
      )

    if (isAlreadyMember)
      return left(new ResourceAlreadyExistsError('conversation member'))

    const member = ConversationMember.create({
      userId: new UniqueEntityId(userId),
      conversationId: invite.conversationId,
      role: 'member',
      lastReadMessageId: null,
    })

    invite.accept()

    // atômico: nunca sobra o usuário na sala com o convite ainda 'pending'
    await this.roomInviteRepository.acceptWithMember(invite, member)

    return right({
      invite: RoomMapper.inviteToDto(invite),
      room: RoomMapper.toDto(conversation),
      member: RoomMapper.memberToDto(member),
    })
  }
}
