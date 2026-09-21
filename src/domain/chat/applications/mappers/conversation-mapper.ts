import { Conversation } from '../../entities/conversation'
import { ConversationMember } from '../../entities/conversation-member'
import { ConversationDto } from '../dtos/conversation-dto'
import { ConversationMemberDto } from '../dtos/conversation-member-dto'

export class ConversationMapper {
  static toDto(conversation: Conversation): ConversationDto {
    return {
      id: conversation.id.toString(),
      type: conversation.type,
      name: conversation.name,
      createdById: conversation.createdById.toString(),
      createdAt: conversation.createdAt,
    }
  }

  static memberToDto(member: ConversationMember): ConversationMemberDto {
    return {
      id: member.id.toString(),
      conversationId: member.conversationId.toString(),
      userId: member.userId.toString(),
      role: member.role,
      joinedAt: member.joinedAt,
      lastReadMessageId: member.lastReadMessageId?.toString() ?? null,
    }
  }
}
