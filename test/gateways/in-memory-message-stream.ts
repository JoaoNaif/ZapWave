import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { Message } from '@/domain/chat/entities/message'

export class InMemoryMessageStream implements MessageStream {
  public published: { conversationId: string; message: Message }[] = []

  async publish(conversationId: string, message: Message): Promise<void> {
    this.published.push({ conversationId, message })
  }
}
