import { Message } from '../../entities/message'
import { LastMessagePreviewDto } from '../dtos/last-message-preview-dto'

export const PREVIEW_MAX_LENGTH = 100

export function truncatePreview(body: string): string {
  // por code point, não por unidade UTF-16: cortar no meio de um emoji
  // deixaria meio par substituto no fim
  const chars = Array.from(body)

  return chars.length > PREVIEW_MAX_LENGTH
    ? chars.slice(0, PREVIEW_MAX_LENGTH).join('') + '…'
    : body
}

export class LastMessagePreviewMapper {
  static toDto(
    message: Message,
    senderDisplayName: string
  ): LastMessagePreviewDto {
    return {
      id: message.id.toString(),
      senderId: message.senderId.toString(),
      senderDisplayName,
      body: truncatePreview(message.body),
      createdAt: message.createdAt,
    }
  }
}
