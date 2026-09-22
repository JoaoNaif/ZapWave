import { pipeline } from 'node:stream/promises'
import { WebSocket } from 'ws'
import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { createDeviceInboxReadable } from './device-inbox.readable'
import { createEnrichTransform } from './enrich.transform'
import { createWsWritable } from './ws.writable'

// Readable (Redis) → Transform (serializa) → Writable (socket), com
// pipeline() cuidando do backpressure e da limpeza dos três lados quando
// qualquer um termina ou dá erro (ver docs/01-streams.md §3-4).
export function startDeliveryPipeline(
  messageStream: MessageStream,
  deviceId: string,
  resumeCursorId: string | null,
  socket: WebSocket
): Promise<void> {
  const readable = createDeviceInboxReadable(
    messageStream,
    deviceId,
    resumeCursorId
  )
  const transform = createEnrichTransform()
  const writable = createWsWritable(socket)

  return pipeline(readable, transform, writable)
}
