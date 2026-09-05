import { Entity } from '@/core/entities/entity'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

export interface ConversationProps {
  type: 'dm' | 'room'
  name: string | null
  createdById: UniqueEntityId
  createdAt: Date
}

export class Conversation extends Entity<ConversationProps> {
  get type() {
    return this.props.type
  }

  set type(type: 'dm' | 'room') {
    this.props.type = type
  }

  get name() {
    return this.props.name
  }

  set name(name: string | null) {
    this.props.name = name
  }

  get createdById() {
    return this.props.createdById
  }

  set createdById(createdById: UniqueEntityId) {
    this.props.createdById = createdById
  }

  get createdAt() {
    return this.props.createdAt
  }

  static create(
    props: Optional<ConversationProps, 'createdAt'>,
    id?: UniqueEntityId
  ) {
    const conversation = new Conversation(
      {
        ...props,
        createdAt: props.createdAt ?? new Date(),
      },
      id
    )

    return conversation
  }
}
