import { Either, left, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { RoomInvite } from '../../entities/room-invite'
import { RoomInviteRepository } from '../repositories/room-invite-repository'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Injectable } from '@nestjs/common'
import { RoomDto } from '../dtos/room-dto'
import { RoomMemberDto } from '../dtos/room-member-dto'
import { RoomInviteDto } from '../dtos/room-invite-dto'
import { RoomMapper } from '../mappers/room-mapper'

interface InviteToRoomReq {
  conversationId: string
  senderId: string
  recipientId: string
}

type InviteToRoomRes = Either<
  ResourceNotFoundError | NotAllowedError | ResourceAlreadyExistsError,
  { invite: RoomInviteDto; room: RoomDto; sender: RoomMemberDto }
>

@Injectable()
export class InviteToRoomUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository,
    private roomInviteRepository: RoomInviteRepository
  ) {}

  async execute({
    recipientId,
    senderId,
    conversationId,
  }: InviteToRoomReq): Promise<InviteToRoomRes> {
    const conversation =
      await this.conversationRepository.findById(conversationId)

    if (!conversation) return left(new ResourceNotFoundError('conversation'))

    if (conversation.type !== 'room')
      return left(new ResourceNotFoundError('room'))

    const sender =
      await this.conversationMemberRepository.findByUserWithConversationId(
        senderId,
        conversationId
      )

    if (!sender) return left(new ResourceNotFoundError('conversation member'))

    if (sender.role !== 'owner' && sender.role !== 'admin')
      return left(new NotAllowedError())

    const isRecipientAlreadyMember =
      await this.conversationMemberRepository.findByUserWithConversationId(
        recipientId,
        conversationId
      )

    if (isRecipientAlreadyMember)
      return left(new ResourceAlreadyExistsError('conversation member'))

    const isInviteAlreadyExist =
      await this.roomInviteRepository.findByConversationIdAndInviteeId(
        conversationId,
        recipientId
      )

    if (isInviteAlreadyExist)
      return left(new ResourceAlreadyExistsError('room invite'))

    const invite = RoomInvite.create({
      conversationId: conversation.id,
      inviteeId: new UniqueEntityId(recipientId),
      inviterId: new UniqueEntityId(senderId),
      status: 'pending',
    })

    // A checagem acima não segura dois pedidos simultâneos (os dois passam
    // por ela). Quem segura é a constraint única (conversationId, inviteeId)
    // do banco: o segundo create falha e vira o mesmo 409 da checagem.
    try {
      await this.roomInviteRepository.create(invite)
    } catch (error) {
      if (error instanceof ResourceAlreadyExistsError) return left(error)

      throw error
    }

    return right({
      invite: RoomMapper.inviteToDto(invite),
      room: RoomMapper.toDto(conversation),
      sender: RoomMapper.memberToDto(sender),
    })
  }
}
