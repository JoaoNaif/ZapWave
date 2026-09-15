import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Message } from '@/domain/chat/entities/message'
import { Prisma, Message as PrismaMessage } from '@prisma/client'

export class PrismaMessageMapper {
  static toDomain(raw: PrismaMessage): Message {
    return Message.create(
      {
        conversationId: new UniqueEntityId(raw.conversationId),
        senderId: new UniqueEntityId(raw.senderId),
        body: raw.body,
        clientMessageId: raw.clientMessageId
          ? new UniqueEntityId(raw.clientMessageId)
          : null,
        createdAt: raw.createdAt,
      },
      new UniqueEntityId(raw.id)
    )
  }

  static toPrisma(message: Message): Prisma.MessageUncheckedCreateInput {
    return {
      id: message.id.toString(),
      conversationId: message.conversationId.toString(),
      senderId: message.senderId.toString(),
      body: message.body,
      clientMessageId: message.clientMessageId?.toString() ?? null,
      createdAt: message.createdAt,
    }
  }
}
