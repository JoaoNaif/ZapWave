import { EventEmitter } from 'node:events'
import {
  MessageStream,
  StreamEvent,
} from '@/domain/chat/applications/gateways/message-stream'
import { Message } from '@/domain/chat/entities/message'

export class InMemoryMessageStream implements MessageStream {
  public published: {
    conversationId: string
    message: Message
    recipientDeviceIds: string[]
  }[] = []

  // edição e remoção publicadas (as mensagens novas ficam em `published`)
  public publishedEvents: {
    event: Exclude<StreamEvent, { type: 'message' }>
    recipientDeviceIds: string[]
  }[] = []

  public acknowledged: { deviceId: string; messageId: string }[] = []

  private inboxes = new Map<string, StreamEvent[]>()
  private emitter = new EventEmitter()

  async publish(
    conversationId: string,
    message: Message,
    recipientDeviceIds: string[]
  ): Promise<void> {
    this.published.push({ conversationId, message, recipientDeviceIds })

    this.deliver(
      { type: 'message', id: message.id.toString(), message },
      recipientDeviceIds
    )
  }

  async publishEvent(
    event: Exclude<StreamEvent, { type: 'message' }>,
    recipientDeviceIds: string[]
  ): Promise<void> {
    this.publishedEvents.push({ event, recipientDeviceIds })

    this.deliver(event, recipientDeviceIds)
  }

  private deliver(event: StreamEvent, recipientDeviceIds: string[]) {
    for (const deviceId of recipientDeviceIds) {
      const inbox = this.inboxes.get(deviceId) ?? []
      inbox.push(event)
      this.inboxes.set(deviceId, inbox)

      this.emitter.emit(deviceId, event)
    }
  }

  async ack(deviceId: string, eventId: string): Promise<void> {
    this.acknowledged.push({ deviceId, messageId: eventId })

    // ids são ULID: comparação de string ordena por tempo de criação
    const inbox = this.inboxes.get(deviceId) ?? []
    this.inboxes.set(
      deviceId,
      inbox.filter((event) => event.id > eventId)
    )
  }

  // Baseline SEM backpressure: o EventEmitter empurra cada evento para a
  // fila local no ritmo do produtor, e a fila cresce sem limite se o consumidor
  // for lento. O listener só é registrado no primeiro next() (generator lazy).
  async *subscribe(deviceId: string): AsyncIterable<StreamEvent> {
    const queue: StreamEvent[] = []
    let wake: (() => void) | null = null

    const onEvent = (event: StreamEvent) => {
      queue.push(event)
      wake?.()
    }

    this.emitter.on(deviceId, onEvent)

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
      this.emitter.off(deviceId, onEvent)
    }
  }

  async *replayFrom(
    deviceId: string,
    afterEventId: string | null
  ): AsyncIterable<StreamEvent> {
    const pending = [...(this.inboxes.get(deviceId) ?? [])]

    for (const event of pending) {
      if (afterEventId === null || event.id > afterEventId) {
        yield event
      }
    }
  }
}
