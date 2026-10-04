// A mensagem que esta responde, com o corpo cortado em PREVIEW_MAX_LENGTH
export interface ReplyToDto {
  id: string
  senderId: string
  body: string
}

export interface MessageDto {
  id: string
  conversationId: string
  senderId: string
  body: string
  clientMessageId: string | null
  // null quando não é resposta, ou quando a original não existe mais
  replyTo: ReplyToDto | null
  // null enquanto a mensagem nunca foi editada
  editedAt: Date | null
  createdAt: Date
}
