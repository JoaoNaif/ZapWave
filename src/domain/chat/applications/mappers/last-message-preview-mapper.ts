import { Message } from '../../entities/message'
import { LastMessagePreviewDto } from '../dtos/last-message-preview-dto'

export const PREVIEW_MAX_LENGTH = 100

export class LastMessagePreviewMapper {
  static toDto(
    message: Message,
    senderDisplayName: string
  ): LastMessagePreviewDto {
    // por code point, não por unidade UTF-16: cortar no meio de um emoji
    // deixaria meio par substituto no fim
    const chars = Array.from(message.body)
    const body =
      chars.length > PREVIEW_MAX_LENGTH
        ? chars.slice(0, PREVIEW_MAX_LENGTH).join('') + '…'
        : message.body

    return {
      id: message.id.toString(),
      senderId: message.senderId.toString(),
      senderDisplayName,
      body,
      createdAt: message.createdAt,
    }
  }
}
