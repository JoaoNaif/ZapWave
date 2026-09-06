import { RoomInvite } from '../../entities/room-invite'

export abstract class RoomInviteRepository {
  abstract findById(id: string): Promise<RoomInvite | null>
  abstract findByConversationIdAndInviteeId(
    conversationId: string,
    inviteeId: string
  ): Promise<RoomInvite | null>
  abstract create(roominvite: RoomInvite): Promise<void>
  abstract save(roominvite: RoomInvite): Promise<void>
  abstract delete(roominvite: RoomInvite): Promise<void>
}
