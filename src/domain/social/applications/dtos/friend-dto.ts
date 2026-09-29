import { UserSummaryDto } from '@/domain/accounts/applications/dtos/user-summary-dto'

// Um item da lista de amigos: o resumo público do usuário + se ele está
// online agora (Presence), pra sidebar mostrar sem uma chamada por amigo.
export interface FriendDto extends UserSummaryDto {
  online: boolean
  // última mensagem da DM com esse amigo (null = nunca conversaram). Vai na
  // resposta pro front reordenar sozinho quando chegar mensagem pelo WS.
  lastMessageAt: Date | null
}
