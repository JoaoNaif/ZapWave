export interface ConversationDto {
  id: string
  type: 'dm' | 'room'
  name: string | null
  createdById: string
  createdAt: Date
}
