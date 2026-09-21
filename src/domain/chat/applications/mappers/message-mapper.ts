import { Message } from '../../entities/message'
import { MessageDto } from '../dtos/message-dto'

export class MessageMapper {
  static toDto(message: Message): MessageDto {
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
