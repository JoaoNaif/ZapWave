import { EventEmitter } from 'node:events'
import { MessageStream } from '@/domain/chat/applications/gateways/message-stream'
import { Message } from '@/domain/chat/entities/message'

export class InMemoryMessageStream implements MessageStream {
  public published: {
    conversationId: string
    message: Message
    recipientDeviceIds: string[]
  }[] = []

  public acknowledged: { deviceId: string; messageId: string }[] = []

  private inboxes = new Map<string, Message[]>()
  private emitter = new EventEmitter()

  async publish(
    conversationId: string,
    message: Message,
    recipientDeviceIds: string[]
  ): Promise<void> {
    this.published.push({ conversationId, message, recipientDeviceIds })

    for (const deviceId of recipientDeviceIds) {
      const inbox = this.inboxes.get(deviceId) ?? []
      inbox.push(message)
      this.inboxes.set(deviceId, inbox)

      this.emitter.emit(deviceId, message)
    }
  }

  async ack(deviceId: string, messageId: string): Promise<void> {
    this.acknowledged.push({ deviceId, messageId })

    // ids são ULID: comparação de string ordena por tempo de criação
    const inbox = this.inboxes.get(deviceId) ?? []
    this.inboxes.set(
      deviceId,
      inbox.filter((message) => message.id.toString() > messageId)
    )
  }

  // Baseline SEM backpressure: o EventEmitter empurra cada mensagem para a
  // fila local no ritmo do produtor, e a fila cresce sem limite se o consumidor
  // for lento. O listener só é registrado no primeiro next() (generator lazy).
  async *subscribe(deviceId: string): AsyncIterable<Message> {
    const queue: Message[] = []
    let wake: (() => void) | null = null

    const onMessage = (message: Message) => {
      queue.push(message)
      wake?.()
    }

    this.emitter.on(deviceId, onMessage)

    try {
      while (true) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve
          })
          wake = null
          continue
        }

        yield queue.shift()!
      }
    } finally {
      this.emitter.off(deviceId, onMessage)
    }
  }

  async *replayFrom(
    deviceId: string,
    afterMessageId: string | null
  ): AsyncIterable<Message> {
    const pending = [...(this.inboxes.get(deviceId) ?? [])]

    for (const message of pending) {
      if (afterMessageId === null || message.id.toString() > afterMessageId) {
        yield message
      }
    }
  }
}
