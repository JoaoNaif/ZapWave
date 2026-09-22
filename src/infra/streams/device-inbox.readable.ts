import { Readable } from 'node:stream'
import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { Message } from '@/domain/chat/entities/message'

// Primeiro drena o que ficou pendente (reconexão), depois segue ao vivo. Os
// dois lêem do mesmo consumer group no Redis, então não há brecha entre um e
// outro: nada é pulado nem entregue duas vezes (ver docs/06-redis-streams.md §3).
async function* resumeThenLive(
  messageStream: MessageStream,
  deviceId: string,
  resumeCursorId: string | null
): AsyncGenerator<Message> {
  yield* messageStream.replayFrom(deviceId, resumeCursorId)
  yield* messageStream.subscribe(deviceId)
}

// { objectMode: true } porque cada chunk aqui é um objeto Message, não bytes
// (ver docs/01-streams.md §3). Quando esse Readable for destruído (cliente
// desconectou), o Node chama .return() no generator acima — que se propaga
// pros generators do MessageStream e fecha a conexão Redis duplicada.
export function createDeviceInboxReadable(
  messageStream: MessageStream,
  deviceId: string,
  resumeCursorId: string | null
): Readable {
  return Readable.from(
    resumeThenLive(messageStream, deviceId, resumeCursorId),
    {
      objectMode: true,
    }
  )
}
