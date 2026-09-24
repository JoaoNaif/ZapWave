import { Conversation } from '../../entities/conversation'
import { ConversationMember } from '../../entities/conversation-member'

export abstract class ConversationRepository {
  abstract findById(id: string): Promise<Conversation | null>
  abstract create(conversation: Conversation): Promise<void>

  // Grava a conversa E os membros iniciais de uma vez: ou grava tudo, ou nada.
  // Evita sobrar uma conversa sem membro se o processo cair no meio.
  abstract createWithMembers(
    conversation: Conversation,
    members: ConversationMember[]
  ): Promise<void>

  abstract save(conversation: Conversation): Promise<void>
  abstract delete(conversation: Conversation): Promise<void>
}
