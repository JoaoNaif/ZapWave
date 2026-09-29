import { UserSummaryDto } from '@/domain/accounts/applications/dtos/user-summary-dto'

// Um item da lista de amigos: o resumo público do usuário + se ele está
// online agora (Presence), pra sidebar mostrar sem uma chamada por amigo.
export interface FriendDto extends UserSummaryDto {
  online: boolean
}
