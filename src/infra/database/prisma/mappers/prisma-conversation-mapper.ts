import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Conversation } from '@/domain/chat/entities/conversation'
import { Prisma, Conversation as PrismaConversation } from '@prisma/client'

export class PrismaConversationMapper {
  static toDomain(raw: PrismaConversation): Conversation {
    return Conversation.create(
      {
        type: raw.type === 'DM' ? 'dm' : 'room',
        name: raw.name,
        createdById: new UniqueEntityId(raw.createdById),
        createdAt: raw.createdAt,
        dmKey: raw.dmKey,
      },
      new UniqueEntityId(raw.id)
    )
  }

  static toPrisma(
    conversation: Conversation
  ): Prisma.ConversationUncheckedCreateInput {
    return {
      id: conversation.id.toString(),
      type: conversation.type === 'dm' ? 'DM' : 'ROOM',
      name: conversation.name,
      createdById: conversation.createdById.toString(),
      createdAt: conversation.createdAt,
      dmKey: conversation.dmKey,
    }
  }
}
