export interface RoomMemberDto {
  id: string
  roomId: string
  userId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: Date
  lastReadMessageId: string | null
}
