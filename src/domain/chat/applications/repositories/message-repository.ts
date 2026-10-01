import { Message } from '../../entities/message'

// Até onde um membro já leu uma conversa. Sem lastReadMessageId (nunca marcou
// como lida), vale o joinedAt: quem entra numa sala antiga não herda o
// histórico inteiro como "não lido".
export interface UnreadCursor {
  conversationId: string
  lastReadMessageId: string | null
  joinedAt: Date
}

export abstract class MessageRepository {
  abstract findById(id: string): Promise<Message | null>
  abstract findByClientMessageId(
    conversationId: string,
    senderId: string,
    clientMessageId: string
  ): Promise<Message | null>

  abstract findManyByConversationId(
    conversationId: string,
    params: { before?: string; limit: number }
  ): Promise<Message[]>

  // a mais recente de cada conversa, numa consulta só. Conversa sem mensagem
  // fica fora da lista.
  abstract findManyLastByConversationIds(
    conversationIds: string[]
  ): Promise<Message[]>

  // mensagens dos OUTROS depois do cursor, por conversa, numa consulta só.
  // Conversa sem nenhuma não lida fica fora do Map.
  abstract countUnreadByConversation(
    userId: string,
    cursors: UnreadCursor[]
  ): Promise<Map<string, number>>

  abstract create(message: Message): Promise<void>
  abstract save(message: Message): Promise<void>
  abstract delete(message: Message): Promise<void>
}
