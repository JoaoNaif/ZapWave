export interface ConversationMemberDto {
  id: string
  conversationId: string
  userId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: Date
  lastReadMessageId: string | null
}
