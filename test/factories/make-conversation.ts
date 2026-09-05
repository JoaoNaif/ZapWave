import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import {
  Conversation,
  ConversationProps,
} from '@/domain/chat/entities/conversation'

export function makeConversation(
  override: Partial<ConversationProps> = {},
  id?: UniqueEntityId
) {
  const conversation = Conversation.create(
    {
      type: 'dm',
      name: null,
      createdById: new UniqueEntityId(),
      ...override,
    },
    id
  )

  return conversation
}
