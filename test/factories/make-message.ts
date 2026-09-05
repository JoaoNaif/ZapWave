import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Message, MessageProps } from '@/domain/chat/entities/message'
import { faker } from '@faker-js/faker'

export function makeMessage(
  override: Partial<MessageProps> = {},
  id?: UniqueEntityId
) {
  const message = Message.create(
    {
      conversationId: new UniqueEntityId(),
      senderId: new UniqueEntityId(),
      body: faker.lorem.sentence(),
      clientMessageId: null,
      ...override,
    },
    id
  )

  return message
}
