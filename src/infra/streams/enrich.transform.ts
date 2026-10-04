import { Transform } from 'node:stream'
import { StreamEvent } from '@/domain/chat/applications/gateways/message-stream'
import { MessageMapper } from '@/domain/chat/applications/mappers/message-mapper'

// Entra StreamEvent (objeto) de um lado, sai frame de texto JSON do outro —
// por isso só o lado de escrita é objectMode. A mensagem usa o mesmo DTO que a
// API HTTP já devolve (MessageMapper), pra não ter dois formatos de mensagem
// no projeto.
//
// `eventId` (edição/remoção) é o que o cliente confirma no frame `ack`, igual
// ao id de uma mensagem nova: o ack é cumulativo por ordem de id.
export function frameOf(event: StreamEvent): string {
  switch (event.type) {
    case 'message':
      return JSON.stringify({
        type: 'message',
        message: MessageMapper.toDto(event.message),
      })
    case 'message-edited':
      return JSON.stringify({
        type: 'message-edited',
        eventId: event.id,
        message: MessageMapper.toDto(event.message),
      })
    case 'message-deleted':
      return JSON.stringify({
        type: 'message-deleted',
        eventId: event.id,
        messageId: event.messageId,
        conversationId: event.conversationId,
      })
  }
}

export function createEnrichTransform(): Transform {
  return new Transform({
    writableObjectMode: true,
    transform(event: StreamEvent, _encoding, callback) {
      callback(null, frameOf(event))
    },
  })
}
