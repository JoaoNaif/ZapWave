export interface RoomInviteDto {
  id: string
  roomId: string
  inviterId: string
  inviteeId: string
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  createdAt: Date
  respondedAt: Date | null
}
