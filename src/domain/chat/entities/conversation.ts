import { Entity } from '@/core/entities/entity'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

export interface ConversationProps {
  type: 'dm' | 'room'
  name: string | null
  createdById: UniqueEntityId
  createdAt: Date
  // Só nas DMs: identifica o par de usuários. O banco tem constraint única
  // nela, então duas DMs pro mesmo par não coexistem. null em sala (e nas DMs
  // criadas antes da chave existir).
  dmKey: string | null
}

export class Conversation extends Entity<ConversationProps> {
  // Mesma chave pra A→B e B→A (ids ordenados) — mesmo padrão do Friendship.pairKey
  static dmKeyFor(userIdA: string, userIdB: string): string {
    return [userIdA, userIdB].sort().join(':')
  }

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

  get dmKey() {
    return this.props.dmKey
  }

  static create(
    props: Optional<ConversationProps, 'createdAt' | 'dmKey'>,
    id?: UniqueEntityId
  ) {
    const conversation = new Conversation(
      {
        ...props,
        createdAt: props.createdAt ?? new Date(),
        dmKey: props.dmKey ?? null,
      },
      id
    )

    return conversation
  }
}
