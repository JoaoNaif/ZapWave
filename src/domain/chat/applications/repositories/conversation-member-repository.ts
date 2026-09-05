import { ConversationMember } from '../../entities/conversation-member'

export abstract class ConversationMemberRepository {
  abstract findById(id: string): Promise<ConversationMember | null>
  abstract findManyByUserId(userId: string): Promise<ConversationMember[]>
  abstract create(conversationmember: ConversationMember): Promise<void>
  abstract save(conversationmember: ConversationMember): Promise<void>
  abstract delete(conversationmember: ConversationMember): Promise<void>
}
