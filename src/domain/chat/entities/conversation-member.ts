import { Entity } from '@/core/entities/entity'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

export interface ConversationMemberProps {
  conversationId: UniqueEntityId
  userId: UniqueEntityId
  role: 'owner' | 'admin' | 'member'
  joinedAt: Date
  lastReadMessageId: UniqueEntityId | null
}

export class ConversationMember extends Entity<ConversationMemberProps> {
  get conversationId() {
    return this.props.conversationId
  }

  set conversationId(conversationId: UniqueEntityId) {
    this.props.conversationId = conversationId
  }

  get userId() {
    return this.props.userId
  }

  set userId(userId: UniqueEntityId) {
    this.props.userId = userId
  }

  get role() {
    return this.props.role
  }

  set role(role: 'owner' | 'admin' | 'member') {
    this.props.role = role
  }

  get joinedAt() {
    return this.props.joinedAt
  }

  set joinedAt(joinedAt: Date) {
    this.props.joinedAt = joinedAt
  }

  get lastReadMessageId() {
    return this.props.lastReadMessageId
  }

  set lastReadMessageId(lastReadMessageId: UniqueEntityId | null) {
    this.props.lastReadMessageId = lastReadMessageId
  }

  static create(
    props: Optional<ConversationMemberProps, 'joinedAt'>,
    id?: UniqueEntityId
  ) {
    const conversation = new ConversationMember(
      {
        ...props,
        joinedAt: props.joinedAt ?? new Date(),
      },
      id
    )

    return conversation
  }
}
