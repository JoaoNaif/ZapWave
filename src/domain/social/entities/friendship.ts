import { Entity } from '@/core/entities/entity'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

export interface FriendshipProps {
  senderId: string
  recipientId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: Date
  updatedAt: Date
}

export class Friendship extends Entity<FriendshipProps> {
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

  set status(status: 'pending' | 'accepted' | 'rejected') {
    this.props.status = status
    this.touch()
  }

  private touch() {
    this.props.updatedAt = new Date()
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

    return friendship
  }
}
