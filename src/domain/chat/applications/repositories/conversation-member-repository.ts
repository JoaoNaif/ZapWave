import { ConversationMember } from '../../entities/conversation-member'

export abstract class ConversationMemberRepository {
  abstract findById(id: string): Promise<ConversationMember | null>
  abstract findManyByUserId(userId: string): Promise<ConversationMember[]>
  abstract findManyByConversationId(
    conversationId: string
  ): Promise<ConversationMember[]>
  // conversationId → quantidade de membros (conversa sem membro fica de fora)
  abstract countManyByConversationIds(
    conversationIds: string[]
  ): Promise<Map<string, number>>
  abstract findByUserWithConversationId(
    userId: string,
    conversationId: string
  ): Promise<ConversationMember | null>
  abstract create(conversationmember: ConversationMember): Promise<void>
  abstract save(conversationmember: ConversationMember): Promise<void>
  abstract delete(conversationmember: ConversationMember): Promise<void>
}
