import { ulid } from 'ulid'
import { Entity } from '@/core/entities/entity'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

// Trecho da mensagem respondida, já cortado (ver truncatePreview). Não é
// persistido: o repositório só guarda replyToId, e quem monta a Message para
// entregar (envio, histórico, replay do Redis) hidrata este campo.
export interface MessageReplyPreview {
  id: string
  senderId: string
  body: string
}

export interface MessageProps {
  conversationId: UniqueEntityId
  senderId: UniqueEntityId
  body: string
  clientMessageId: UniqueEntityId | null
  replyToId: UniqueEntityId | null
  replyTo: MessageReplyPreview | null
  createdAt: Date
}

export class Message extends Entity<MessageProps> {
  get conversationId() {
    return this.props.conversationId
  }

  set conversationId(conversationId: UniqueEntityId) {
    this.props.conversationId = conversationId
  }

  get senderId() {
    return this.props.senderId
  }

  set senderId(senderId: UniqueEntityId) {
    this.props.senderId = senderId
  }

  get body() {
    return this.props.body
  }

  set body(body: string) {
    this.props.body = body
  }

  get clientMessageId() {
    return this.props.clientMessageId
  }

  set clientMessageId(clientMessageId: UniqueEntityId | null) {
    this.props.clientMessageId = clientMessageId
  }

  get replyToId() {
    return this.props.replyToId
  }

  get replyTo() {
    return this.props.replyTo
  }

  set replyTo(replyTo: MessageReplyPreview | null) {
    this.props.replyTo = replyTo
  }

  get createdAt() {
    return this.props.createdAt
  }

  static create(
    props: Optional<MessageProps, 'createdAt' | 'replyToId' | 'replyTo'>,
    id?: UniqueEntityId
  ) {
    const message = new Message(
      {
        ...props,
        replyToId: props.replyToId ?? null,
        replyTo: props.replyTo ?? null,
        createdAt: props.createdAt ?? new Date(),
      },
      // ULID em vez do UUID v4 padrão: ordenável por tempo, usado como
      // cursor de paginação do histórico (ver docs/03-entidades.md, 3.5)
      id ?? new UniqueEntityId(ulid())
    )

    return message
  }
}
