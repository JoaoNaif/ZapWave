export interface MessageDto {
  id: string
  conversationId: string
  senderId: string
  body: string
  clientMessageId: string | null
  createdAt: Date
}
