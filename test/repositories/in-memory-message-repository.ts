import {
  MessageRepository,
  UnreadCursor,
} from '@/domain/chat/applications/repositories/message-repository'
import { Message } from '@/domain/chat/entities/message'

export class InMemoryMessageRepository implements MessageRepository {
  public items: Message[] = []

  async findById(id: string): Promise<Message | null> {
    const message = this.items.find((item) => item.id.toString() === id)

    if (!message) {
      return null
    }

    return message
  }

  async findByClientMessageId(
    conversationId: string,
    senderId: string,
    clientMessageId: string
  ): Promise<Message | null> {
    const message = this.items.find(
      (item) =>
        item.conversationId.toString() === conversationId &&
        item.senderId.toString() === senderId &&
        item.clientMessageId?.toString() === clientMessageId
    )

    return message ?? null
  }

  async findManyByConversationId(
    conversationId: string,
    { before, limit }: { before?: string; limit: number }
  ): Promise<Message[]> {
    let messages = this.items.filter(
      (item) => item.conversationId.toString() === conversationId
    )

    if (before) {
      messages = messages.filter((item) => item.id.toString() < before)
    }

    // ids são ULID: comparação de string já ordena por tempo de criação
    return messages
      .sort((a, b) => (a.id.toString() < b.id.toString() ? 1 : -1))
      .slice(0, limit)
  }

  async countUnreadByConversation(
    userId: string,
    cursors: UnreadCursor[]
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>()

    for (const cursor of cursors) {
      const count = this.items.filter(
        (item) =>
          item.conversationId.toString() === cursor.conversationId &&
          item.senderId.toString() !== userId &&
          (cursor.lastReadMessageId
            ? item.id.toString() > cursor.lastReadMessageId
            : item.createdAt >= cursor.joinedAt)
      ).length

      if (count > 0) counts.set(cursor.conversationId, count)
    }

    return counts
  }

  async create(message: Message): Promise<void> {
    this.items.push(message)
  }

  async save(message: Message): Promise<void> {
    const itemIndex = this.items.findIndex((item) => item.id.equals(message.id))

    this.items[itemIndex] = message
  }

  async delete(message: Message): Promise<void> {
    const itemIndex = this.items.findIndex((item) => item.id.equals(message.id))

    this.items.splice(itemIndex, 1)
  }
}
