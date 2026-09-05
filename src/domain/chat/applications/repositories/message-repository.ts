import { Message } from '../../entities/message'

export abstract class MessageRepository {
  abstract findById(id: string): Promise<Message | null>
  abstract findManyByConversationId(
    conversationId: string,
    params: { before?: string; limit: number }
  ): Promise<Message[]>

  abstract create(message: Message): Promise<void>
  abstract save(message: Message): Promise<void>
  abstract delete(message: Message): Promise<void>
}
