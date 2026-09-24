import { Either, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { Conversation } from '@/domain/chat/entities/conversation'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { Injectable } from '@nestjs/common'
import { RoomDto } from '../dtos/room-dto'
import { RoomMemberDto } from '../dtos/room-member-dto'
import { RoomMapper } from '../mappers/room-mapper'

interface CreateRoomReq {
  name: string
  userId: string
}

type CreateRoomRes = Either<never, { room: RoomDto; owner: RoomMemberDto }>

@Injectable()
export class CreateRoomUseCase {
  constructor(private conversationRepository: ConversationRepository) {}

  async execute({ name, userId }: CreateRoomReq): Promise<CreateRoomRes> {
    const conversation = Conversation.create({
      name,
      type: 'room',
      createdById: new UniqueEntityId(userId),
    })

    const conversationMember = ConversationMember.create({
      userId: new UniqueEntityId(userId),
      conversationId: conversation.id,
      role: 'owner',
      lastReadMessageId: null,
    })

    // atômico: nunca sobra uma sala sem o dono como membro
    await this.conversationRepository.createWithMembers(conversation, [
      conversationMember,
    ])

    return right({
      room: RoomMapper.toDto(conversation),
      owner: RoomMapper.memberToDto(conversationMember),
    })
  }
}
