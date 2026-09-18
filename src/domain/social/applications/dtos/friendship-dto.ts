export interface FriendshipDto {
  id: string
  senderId: string
  recipientId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: Date
  updatedAt: Date
}
