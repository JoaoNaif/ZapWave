// Até onde OUTRO membro já leu a conversa — o que o front usa pra pintar o
// ✓✓ nas minhas mensagens com id <= lastReadMessageId. null = nunca leu.
export interface ConversationReadDto {
  userId: string
  lastReadMessageId: string | null
}
