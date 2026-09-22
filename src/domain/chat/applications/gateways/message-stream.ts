import { Message } from '../../entities/message'

export abstract class MessageStream {
  // Grava a mensagem no log da conversa e no inbox de cada device destinatário.
  // Quem decide os destinatários é o use-case; o adapter só entrega.
  abstract publish(
    conversationId: string,
    message: Message,
    recipientDeviceIds: string[]
  ): Promise<void>

  // Confirma que o device recebeu até messageId: sai do inbox pendente.
  abstract ack(deviceId: string, messageId: string): Promise<void>

  // Mensagens novas do inbox do device, sem fim, na ordem de publicação. Só
  // "puxa" quando o consumidor pede a próxima — é aí que mora o backpressure.
  // Encerrar o consumo (break / return / destroy) libera os recursos.
  abstract subscribe(deviceId: string): AsyncIterable<Message>

  // Mensagens pendentes do inbox depois de afterMessageId (null = desde o
  // início), em ordem, e termina. Usado na reconexão do device.
  abstract replayFrom(
    deviceId: string,
    afterMessageId: string | null
  ): AsyncIterable<Message>
}
