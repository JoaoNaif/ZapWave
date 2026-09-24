import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { Conversation } from '@/domain/chat/entities/conversation'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { InMemoryConversationMemberRepository } from './in-memory-conversation-member-repository'

export class InMemoryConversationRepository implements ConversationRepository {
  public items: Conversation[] = []

  // só createWithMembers precisa dele: grava os membros junto, como o banco
  constructor(
    private memberRepository?: InMemoryConversationMemberRepository
  ) {}

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

  async createWithMembers(
    conversation: Conversation,
    members: ConversationMember[]
  ): Promise<void> {
    if (!this.memberRepository) {
      throw new Error(
        'InMemoryConversationRepository precisa do repositório de membros para createWithMembers'
      )
    }

    this.items.push(conversation)

    for (const member of members) {
      await this.memberRepository.create(member)
    }
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
