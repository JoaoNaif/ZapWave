import { Message } from '../../entities/message'

// O que trafega no inbox de um device. `id` é a chave de ordenação e de ack
// (ULID, ordenável por tempo): numa mensagem nova é o id dela; edição e
// remoção ganham um id próprio, gerado na hora do evento, para ficarem depois
// de tudo que já foi publicado — o ack cumulativo e o cursor de replay
// continuam valendo sem exceção.
export type StreamEvent =
  | { type: 'message'; id: string; message: Message }
  | { type: 'message-edited'; id: string; message: Message }
  | {
      type: 'message-deleted'
      id: string
      messageId: string
      conversationId: string
    }

export abstract class MessageStream {
  // Grava a mensagem no log da conversa e no inbox de cada device destinatário.
  // Quem decide os destinatários é o use-case; o adapter só entrega.
  abstract publish(
    conversationId: string,
    message: Message,
    recipientDeviceIds: string[]
  ): Promise<void>

  // Mesmo fan-out, para edição e remoção de mensagem (ver StreamEvent).
  abstract publishEvent(
    event: Exclude<StreamEvent, { type: 'message' }>,
    recipientDeviceIds: string[]
  ): Promise<void>

  // Confirma que o device recebeu até eventId: sai do inbox pendente.
  abstract ack(deviceId: string, eventId: string): Promise<void>

  // Eventos novos do inbox do device, sem fim, na ordem de publicação. Só
  // "puxa" quando o consumidor pede o próximo — é aí que mora o backpressure.
  // Encerrar o consumo (break / return / destroy) libera os recursos.
  abstract subscribe(deviceId: string): AsyncIterable<StreamEvent>

  // Eventos pendentes do inbox depois de afterEventId (null = desde o
  // início), em ordem, e termina. Usado na reconexão do device.
  abstract replayFrom(
    deviceId: string,
    afterEventId: string | null
  ): AsyncIterable<StreamEvent>
}
