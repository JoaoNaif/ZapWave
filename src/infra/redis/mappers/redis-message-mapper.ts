import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Message } from '@/domain/chat/entities/message'

// XADD/XRANGE/XREADGROUP devolvem os campos como array plano [k1, v1, k2, v2, ...]
type RedisStreamFields = string[]

export class RedisMessageMapper {
  static toFields(message: Message): RedisStreamFields {
    return [
      'messageId',
      message.id.toString(),
      'conversationId',
      message.conversationId.toString(),
      'senderId',
      message.senderId.toString(),
      'body',
      message.body,
      'clientMessageId',
      message.clientMessageId?.toString() ?? '',
      'createdAt',
      message.createdAt.toISOString(),
    ]
  }

  static fieldsToMessage(fields: RedisStreamFields): Message {
    const raw: Record<string, string> = {}
    for (let i = 0; i < fields.length; i += 2) {
      raw[fields[i]] = fields[i + 1]
    }

    return Message.create(
      {
        conversationId: new UniqueEntityId(raw.conversationId),
        senderId: new UniqueEntityId(raw.senderId),
        body: raw.body,
        clientMessageId: raw.clientMessageId
          ? new UniqueEntityId(raw.clientMessageId)
          : null,
        createdAt: new Date(raw.createdAt),
      },
      new UniqueEntityId(raw.messageId)
    )
  }

  static messageIdOf(fields: RedisStreamFields): string {
    const index = fields.indexOf('messageId')
    return fields[index + 1]
  }
}
