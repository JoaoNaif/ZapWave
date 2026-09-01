import { Entity } from '@/core/entities/entity'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

export interface DeviceProps {
  userId: UniqueEntityId
  name?: string | null
  createdAt: Date
  lastSeenAt: Date
  resumeCursorId: UniqueEntityId | null
  revokedAt?: Date | null
}

export class Device extends Entity<DeviceProps> {
  get userId() {
    return this.props.userId
  }

  get name() {
    return this.props.name
  }

  set name(name: string | null | undefined) {
    this.props.name = name
  }

  get createdAt() {
    return this.props.createdAt
  }

  get lastSeenAt() {
    return this.props.lastSeenAt
  }

  set lastSeenAt(lastSeenAt: Date) {
    this.props.lastSeenAt = lastSeenAt
  }

  get resumeCursorId() {
    return this.props.resumeCursorId
  }

  set resumeCursorId(resumeCursorId: UniqueEntityId | null) {
    this.props.resumeCursorId = resumeCursorId
  }

  get revokedAt() {
    return this.props.revokedAt
  }

  get isRevoked() {
    return this.props.revokedAt !== null && this.props.revokedAt !== undefined
  }

  revoke() {
    if (this.isRevoked) {
      return
    }

    this.props.revokedAt = new Date()
  }

  static create(
    props: Optional<
      DeviceProps,
      'createdAt' | 'lastSeenAt' | 'resumeCursorId' | 'revokedAt'
    >,
    id?: UniqueEntityId
  ) {
    const device = new Device(
      {
        ...props,
        createdAt: props.createdAt ?? new Date(),
        lastSeenAt: props.lastSeenAt ?? new Date(),
        resumeCursorId: props.resumeCursorId ?? null,
        revokedAt: props.revokedAt ?? null,
      },
      id
    )

    return device
  }
}
