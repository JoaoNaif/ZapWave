import { UserSummaryDto } from '@/domain/accounts/applications/dtos/user-summary-dto'

// Um membro da sala como o front precisa: o id é o do USUÁRIO (não o da
// membership), pra casar direto com o senderId das mensagens e com o
// targetUserId do remove-member.
export interface RoomMemberSummaryDto extends UserSummaryDto {
  role: 'owner' | 'admin' | 'member'
}
