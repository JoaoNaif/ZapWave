import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { StreamEvent } from '@/domain/chat/applications/gateways/message-stream'
import { Message } from '@/domain/chat/entities/message'

// XADD/XRANGE/XREADGROUP devolvem os campos como array plano [k1, v1, k2, v2, ...]
type RedisStreamFields = string[]

type NonMessageEvent = Exclude<StreamEvent, { type: 'message' }>

function toRaw(fields: RedisStreamFields): Record<string, string> {
  const raw: Record<string, string> = {}
  for (let i = 0; i < fields.length; i += 2) {
    raw[fields[i]] = fields[i + 1]
  }
  return raw
}

export class RedisMessageMapper {
  static toFields(message: Message): RedisStreamFields {
    return [
      'messageId',
      message.id.toString(),
      'conversationId',
      message.conversationId.toString(),
      'senderId',
      message.senderId.toString(),
      'body',
      message.body,
      'clientMessageId',
      message.clientMessageId?.toString() ?? '',
      // preview da mensagem respondida, congelado no envio
      'replyToId',
      message.replyTo?.id ?? '',
      'replyToSenderId',
      message.replyTo?.senderId ?? '',
      'replyToBody',
      message.replyTo?.body ?? '',
      'editedAt',
      message.editedAt?.toISOString() ?? '',
      'createdAt',
      message.createdAt.toISOString(),
    ]
  }

  // Entrada sem `type` é mensagem nova (formato de antes da edição/remoção).
  // Edição/remoção levam `eventId`; é ele — não o messageId — a chave de
  // ordenação e de ack da entrada (ver StreamEvent).
  static eventToFields(event: NonMessageEvent): RedisStreamFields {
    if (event.type === 'message-edited') {
      return ['type', event.type, 'eventId', event.id, ...this.toFields(event.message)]
    }

    return [
      'type',
      event.type,
      'eventId',
      event.id,
      'messageId',
      event.messageId,
      'conversationId',
      event.conversationId,
    ]
  }

  static fieldsToEvent(fields: RedisStreamFields): StreamEvent {
    const raw = toRaw(fields)

    if (raw.type === 'message-deleted') {
      return {
        type: 'message-deleted',
        id: raw.eventId,
        messageId: raw.messageId,
        conversationId: raw.conversationId,
      }
    }

    const message = this.fieldsToMessage(fields)

    if (raw.type === 'message-edited') {
      return { type: 'message-edited', id: raw.eventId, message }
    }

    return { type: 'message', id: message.id.toString(), message }
  }

  static fieldsToMessage(fields: RedisStreamFields): Message {
    const raw = toRaw(fields)

    return Message.create(
      {
        conversationId: new UniqueEntityId(raw.conversationId),
        senderId: new UniqueEntityId(raw.senderId),
        body: raw.body,
        clientMessageId: raw.clientMessageId
          ? new UniqueEntityId(raw.clientMessageId)
          : null,
        // entradas antigas do stream (sem estes campos) viram mensagem normal
        replyToId: raw.replyToId ? new UniqueEntityId(raw.replyToId) : null,
        replyTo: raw.replyToId
          ? {
              id: raw.replyToId,
              senderId: raw.replyToSenderId,
              body: raw.replyToBody,
            }
          : null,
        editedAt: raw.editedAt ? new Date(raw.editedAt) : null,
        createdAt: new Date(raw.createdAt),
      },
      new UniqueEntityId(raw.messageId)
    )
  }

  // chave de ordenação/ack da entrada: o id do evento, ou o da mensagem nova
  static eventIdOf(fields: RedisStreamFields): string {
    const raw = toRaw(fields)

    return raw.eventId ?? raw.messageId
  }
}
