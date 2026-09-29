import { UserSummaryDto } from '@/domain/accounts/applications/dtos/user-summary-dto'

// Um pedido de amizade recebido e ainda sem resposta. O friendshipId é o que
// o accept/decline exigem; o sender vem embutido porque não existe rota de
// buscar usuário por id pro front resolver sozinho.
export interface FriendRequestDto {
  friendshipId: string
  sender: UserSummaryDto
  createdAt: Date
}
