import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { FriendCreatedEvent } from '../events/friend-created-event'
import { FriendAcceptedEvent } from '../events/friend-accepted-event'

export interface FriendshipProps {
  senderId: string
  recipientId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: Date
  updatedAt: Date
}

export class Friendship extends AggregateRoot<FriendshipProps> {
  get senderId() {
    return this.props.senderId
  }

  set senderId(senderId: string) {
    this.props.senderId = senderId
    this.touch()
  }

  get recipientId() {
    return this.props.recipientId
  }

  set recipientId(recipientId: string) {
    this.props.recipientId = recipientId
    this.touch()
  }

  get status() {
    return this.props.status
  }

  get pairKey() {
    return [this.props.senderId, this.props.recipientId].sort().join(':')
  }

  get createdAt() {
    return this.props.createdAt
  }

  get updatedAt() {
    return this.props.updatedAt
  }

  set status(status: 'pending' | 'accepted' | 'rejected') {
    this.props.status = status
    this.touch()
  }

  private touch() {
    this.props.updatedAt = new Date()
  }

  public accept() {
    this.status = 'accepted'
    this.addDomainEvent(new FriendAcceptedEvent(this))
  }

  public isAccepted() {
    return this.props.status === 'accepted'
  }

  public isRejected() {
    return this.props.status === 'rejected'
  }

  public isPending() {
    return this.props.status === 'pending'
  }

  static create(
    props: Optional<FriendshipProps, 'createdAt' | 'updatedAt' | 'status'>,
    id?: UniqueEntityId
  ) {
    const friendship = new Friendship(
      {
        ...props,
        status: props.status ?? 'pending',
        createdAt: props.createdAt ?? new Date(),
        updatedAt: props.updatedAt ?? new Date(),
      },
      id
    )

    const isNewFriendship = !id

    if (isNewFriendship) {
      friendship.addDomainEvent(new FriendCreatedEvent(friendship))
    }

    return friendship
  }
}
