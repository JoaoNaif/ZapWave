import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'

export class InMemoryConversationMemberRepository implements ConversationMemberRepository {
  public items: ConversationMember[] = []

  async findById(id: string): Promise<ConversationMember | null> {
    const conversationMember = this.items.find(
      (item) => item.id.toString() === id
    )

    if (!conversationMember) {
      return null
    }

    return conversationMember
  }

  async findManyByUserId(userId: string): Promise<ConversationMember[]> {
    return this.items.filter((item) => item.userId.toString() === userId)
  }

  async findByUserWithConversationId(
    userId: string,
    conversationId: string
  ): Promise<ConversationMember | null> {
    const conversationMember = this.items.find(
      (item) =>
        item.userId.toString() === userId &&
        item.conversationId.toString() === conversationId
    )

    if (!conversationMember) {
      return null
    }

    return conversationMember
  }

  async create(conversationMember: ConversationMember): Promise<void> {
    this.items.push(conversationMember)
  }

  async save(conversationMember: ConversationMember): Promise<void> {
    const itemIndex = this.items.findIndex((item) =>
      item.id.equals(conversationMember.id)
    )

    this.items[itemIndex] = conversationMember
  }

  async delete(conversationMember: ConversationMember): Promise<void> {
    const itemIndex = this.items.findIndex((item) =>
      item.id.equals(conversationMember.id)
    )

    this.items.splice(itemIndex, 1)
  }
}
