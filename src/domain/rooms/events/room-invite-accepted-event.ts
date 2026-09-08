import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { DomainEvent } from '@/core/events/domain-event'
import { RoomInvite } from '../entities/room-invite'

export class RoomInviteAcceptedEvent implements DomainEvent {
  public ocurredAt: Date
  public roomInvite: RoomInvite

  constructor(roomInvite: RoomInvite) {
    this.roomInvite = roomInvite
    this.ocurredAt = new Date()
  }

  getAggregateId(): UniqueEntityId {
    return this.roomInvite.id
  }
}
