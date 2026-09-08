import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { RoomInviteCreatedEvent } from '../events/room-invite-created-event'
import { RoomInviteAcceptedEvent } from '../events/room-invite-accepted-event'

export interface RoomInviteProps {
  conversationId: UniqueEntityId
  inviterId: UniqueEntityId
  inviteeId: UniqueEntityId
  status: 'pending' | 'accepted' | 'declined' | 'revoked'
  createdAt: Date
  respondedAt: Date | null
}

export class RoomInvite extends AggregateRoot<RoomInviteProps> {
  get conversationId() {
    return this.props.conversationId
  }

  set conversationId(conversationId: UniqueEntityId) {
    this.props.conversationId = conversationId
  }

  get inviterId() {
    return this.props.inviterId
  }

  set inviterId(inviterId: UniqueEntityId) {
    this.props.inviterId = inviterId
  }

  get inviteeId() {
    return this.props.inviteeId
  }

  set inviteeId(inviteeId: UniqueEntityId) {
    this.props.inviteeId = inviteeId
  }

  get status() {
    return this.props.status
  }

  set status(status: 'pending' | 'accepted' | 'declined' | 'revoked') {
    this.props.status = status
  }

  get createdAt() {
    return this.props.createdAt
  }

  get respondedAt() {
    return this.props.respondedAt
  }

  set respondedAt(respondedAt: Date | null) {
    this.props.respondedAt = respondedAt
  }

  accept() {
    this.props.status = 'accepted'
    this.props.respondedAt = new Date()
    this.addDomainEvent(new RoomInviteAcceptedEvent(this))
  }

  static create(
    props: Optional<RoomInviteProps, 'createdAt' | 'respondedAt'>,
    id?: UniqueEntityId
  ) {
    const roomInvite = new RoomInvite(
      {
        ...props,
        createdAt: props.createdAt ?? new Date(),
        respondedAt: props.respondedAt ?? null,
      },
      id
    )

    const isNewRoomInvite = !id

    if (isNewRoomInvite) {
      roomInvite.addDomainEvent(new RoomInviteCreatedEvent(roomInvite))
    }

    return roomInvite
  }
}
