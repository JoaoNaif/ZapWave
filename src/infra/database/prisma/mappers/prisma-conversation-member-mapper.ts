import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import {
  Prisma,
  ConversationMember as PrismaConversationMember,
} from '@prisma/client'

export class PrismaConversationMemberMapper {
  static toDomain(raw: PrismaConversationMember): ConversationMember {
    return ConversationMember.create(
      {
        conversationId: new UniqueEntityId(raw.conversationId),
        userId: new UniqueEntityId(raw.userId),
        role: raw.role.toLowerCase() as 'owner' | 'admin' | 'member',
        joinedAt: raw.joinedAt,
        lastReadMessageId: raw.lastReadMessageId
          ? new UniqueEntityId(raw.lastReadMessageId)
          : null,
      },
      new UniqueEntityId(raw.id)
    )
  }

  static toPrisma(
    conversationMember: ConversationMember
  ): Prisma.ConversationMemberUncheckedCreateInput {
    return {
      id: conversationMember.id.toString(),
      conversationId: conversationMember.conversationId.toString(),
      userId: conversationMember.userId.toString(),
      role: conversationMember.role.toUpperCase() as Prisma.ConversationMemberUncheckedCreateInput['role'],
      joinedAt: conversationMember.joinedAt,
      lastReadMessageId: conversationMember.lastReadMessageId?.toString() ?? null,
    }
  }
}
