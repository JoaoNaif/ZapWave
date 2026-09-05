import { Message } from '../../entities/message'

export abstract class MessageStream {
  abstract publish(conversationId: string, message: Message): Promise<void>
}
