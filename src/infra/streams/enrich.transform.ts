import { Transform } from 'node:stream'
import { Message } from '@/domain/chat/entities/message'
import { MessageMapper } from '@/domain/chat/applications/mappers/message-mapper'

// Entra Message (objeto) de um lado, sai frame de texto JSON do outro — por
// isso só o lado de escrita é objectMode. O mesmo DTO/shape que a API HTTP já
// devolve (MessageMapper), pra não ter dois formatos de mensagem no projeto.
export function createEnrichTransform(): Transform {
  return new Transform({
    writableObjectMode: true,
    transform(message: Message, _encoding, callback) {
      const frame = JSON.stringify({
        type: 'message',
        message: MessageMapper.toDto(message),
      })

      callback(null, frame)
    },
  })
}
