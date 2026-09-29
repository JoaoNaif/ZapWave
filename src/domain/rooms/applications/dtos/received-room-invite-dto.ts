import { UserSummaryDto } from '@/domain/accounts/applications/dtos/user-summary-dto'

// Um convite de sala recebido e ainda sem resposta. O inviteId é o que o
// accept-room-invite exige; sala e quem convidou vêm embutidos pro front
// mostrar o convite sem outra chamada.
export interface ReceivedRoomInviteDto {
  inviteId: string
  room: {
    id: string
    name: string
  }
  inviter: UserSummaryDto
  createdAt: Date
}
