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

  async findManyByConversationId(
    conversationId: string
  ): Promise<ConversationMember[]> {
    return this.items.filter(
      (item) => item.conversationId.toString() === conversationId
    )
  }

  async countManyByConversationIds(
    conversationIds: string[]
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>()

    for (const item of this.items) {
      const conversationId = item.conversationId.toString()

      if (!conversationIds.includes(conversationId)) continue

      counts.set(conversationId, (counts.get(conversationId) ?? 0) + 1)
    }

    return counts
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
