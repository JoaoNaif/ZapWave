import { Injectable } from '@nestjs/common'
import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { Message } from '@/domain/chat/entities/message'

/**
 * Stub temporário até o RedisMessageStream (Redis Streams + pipeline de Node
 * streams até o WebSocket) existir. A mensagem é persistida no Postgres pelo
 * use-case, mas nada é entregue em tempo real.
 */
@Injectable()
export class NoopMessageStream implements MessageStream {
  async publish(
    _conversationId: string,
    _message: Message,
    _recipientDeviceIds: string[]
  ): Promise<void> {}

  async ack(_deviceId: string, _messageId: string): Promise<void> {}

  async *subscribe(_deviceId: string): AsyncIterable<Message> {}

  async *replayFrom(
    _deviceId: string,
    _afterMessageId: string | null
  ): AsyncIterable<Message> {}
}
