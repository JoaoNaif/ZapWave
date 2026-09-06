import { RoomInviteRepository } from '@/domain/rooms/applications/repositories/room-invite-repository'
import { RoomInvite } from '@/domain/rooms/entities/room-invite'

export class InMemoryRoomInviteRepository implements RoomInviteRepository {
  public items: RoomInvite[] = []

  async findById(id: string): Promise<RoomInvite | null> {
    const roomInvite = this.items.find((item) => item.id.toString() === id)

    if (!roomInvite) {
      return null
    }

    return roomInvite
  }

  async findByConversationIdAndInviteeId(
    conversationId: string,
    inviteeId: string
  ): Promise<RoomInvite | null> {
    const roomInvite = this.items.find(
      (item) =>
        item.conversationId.toString() === conversationId &&
        item.inviteeId.toString() === inviteeId
    )

    if (!roomInvite) {
      return null
    }

    return roomInvite
  }

  async create(roomInvite: RoomInvite): Promise<void> {
    this.items.push(roomInvite)
  }

  async save(roomInvite: RoomInvite): Promise<void> {
    const itemIndex = this.items.findIndex((item) =>
      item.id.equals(roomInvite.id)
    )

    this.items[itemIndex] = roomInvite
  }

  async delete(roomInvite: RoomInvite): Promise<void> {
    const itemIndex = this.items.findIndex((item) =>
      item.id.equals(roomInvite.id)
    )

    this.items.splice(itemIndex, 1)
  }
}
