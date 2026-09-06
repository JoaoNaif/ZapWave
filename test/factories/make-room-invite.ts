import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import {
  RoomInvite,
  RoomInviteProps,
} from '@/domain/rooms/entities/room-invite'

export function makeRoomInvite(
  override: Partial<RoomInviteProps> = {},
  id?: UniqueEntityId
) {
  const roomInvite = RoomInvite.create(
    {
      conversationId: new UniqueEntityId(),
      inviterId: new UniqueEntityId(),
      inviteeId: new UniqueEntityId(),
      status: 'pending',
      ...override,
    },
    id
  )

  return roomInvite
}
