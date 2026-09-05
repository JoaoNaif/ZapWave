import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import {
  ConversationMember,
  ConversationMemberProps,
} from '@/domain/chat/entities/conversation-member'

export function makeConversationMember(
  override: Partial<ConversationMemberProps> = {},
  id?: UniqueEntityId
) {
  const conversationMember = ConversationMember.create(
    {
      conversationId: new UniqueEntityId(),
      userId: new UniqueEntityId(),
      role: 'member',
      lastReadMessageId: null,
      ...override,
    },
    id
  )

  return conversationMember
}
