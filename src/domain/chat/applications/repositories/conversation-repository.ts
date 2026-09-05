import { Conversation } from '../../entities/conversation'

export abstract class ConversationRepository {
  abstract findById(id: string): Promise<Conversation | null>
  abstract create(conversation: Conversation): Promise<void>
  abstract save(conversation: Conversation): Promise<void>
  abstract delete(conversation: Conversation): Promise<void>
}
