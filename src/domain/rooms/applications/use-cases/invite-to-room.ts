import { Either, left, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { Conversation } from '@/domain/chat/entities/conversation'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { RoomInvite } from '../../entities/room-invite'
import { RoomInviteRepository } from '../repositories/room-invite-repository'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'

interface InviteToRoomReq {
  conversationId: string
  senderId: string
  recipientId: string
}

type InviteToRoomRes = Either<
  ResourceNotFoundError | NotAllowedError | ResourceAlreadyExistsError,
  { invite: RoomInvite; room: Conversation; sender: ConversationMember }
>

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

    // TODO(infra): o findByConversationIdAndInviteeId + create são checagem e
    // escrita separadas — dois convites concorrentes passam os dois pela
    // verificação. Garantir unique (conversationId, inviteeId) no schema Prisma
    // e tratar a violação aqui quando o PrismaRoomInviteRepository existir.
    await this.roomInviteRepository.create(invite)

    return right({
      invite,
      room: conversation,
      sender,
    })
  }
}
