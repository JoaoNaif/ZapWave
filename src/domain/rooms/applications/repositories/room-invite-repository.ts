import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { RoomInvite } from '../../entities/room-invite'

export abstract class RoomInviteRepository {
  abstract findById(id: string): Promise<RoomInvite | null>
  abstract findByConversationIdAndInviteeId(
    conversationId: string,
    inviteeId: string
  ): Promise<RoomInvite | null>
  abstract findManyByIviteeIdWithStausPending(
    inviteeId: string,
    status: string
  ): Promise<RoomInvite[]>
  // Lança ResourceAlreadyExistsError se já existe convite pra esse par
  // (sala, convidado) — a checagem do use-case não segura dois pedidos
  // simultâneos, quem segura é a constraint única do banco.
  abstract create(roominvite: RoomInvite): Promise<void>

  // Grava o novo membro E o convite aceito de uma vez: ou grava os dois, ou
  // nenhum. Os eventos do convite só disparam depois de tudo gravado.
  abstract acceptWithMember(
    invite: RoomInvite,
    member: ConversationMember
  ): Promise<void>
  abstract save(roominvite: RoomInvite): Promise<void>
  abstract delete(roominvite: RoomInvite): Promise<void>
}
