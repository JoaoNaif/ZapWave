import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { DomainEvent } from '@/core/events/domain-event'
import { Friendship } from '../entities/friendship'

export class FriendCreatedEvent implements DomainEvent {
  public ocurredAt: Date
  public friendship: Friendship

  constructor(friendship: Friendship) {
    this.friendship = friendship
    this.ocurredAt = new Date()
  }

  getAggregateId(): UniqueEntityId {
    return this.friendship.id
  }
}
