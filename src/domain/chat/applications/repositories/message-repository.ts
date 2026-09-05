import { Message } from '../../entities/message'

export abstract class MessageRepository {
  abstract findById(id: string): Promise<Message | null>
  abstract create(message: Message): Promise<void>
  abstract save(message: Message): Promise<void>
  abstract delete(message: Message): Promise<void>
}
