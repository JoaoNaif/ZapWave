import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { Conversation } from '@/domain/chat/entities/conversation'

export class InMemoryConversationRepository implements ConversationRepository {
  public items: Conversation[] = []

  async findById(id: string): Promise<Conversation | null> {
    const conversation = this.items.find((item) => item.id.toString() === id)

    if (!conversation) {
      return null
    }

    return conversation
  }

  async create(conversation: Conversation): Promise<void> {
    this.items.push(conversation)
  }

  async save(conversation: Conversation): Promise<void> {
    const itemIndex = this.items.findIndex((item) =>
      item.id.equals(conversation.id)
    )

    this.items[itemIndex] = conversation
  }

  async delete(conversation: Conversation): Promise<void> {
    const itemIndex = this.items.findIndex((item) =>
      item.id.equals(conversation.id)
    )

    this.items.splice(itemIndex, 1)
  }
}
