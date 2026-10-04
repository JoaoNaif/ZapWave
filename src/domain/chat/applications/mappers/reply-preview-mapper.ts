import { Message, MessageReplyPreview } from '../../entities/message'
import { truncatePreview } from './last-message-preview-mapper'

export function toReplyPreview(original: Message): MessageReplyPreview {
  return {
    id: original.id.toString(),
    senderId: original.senderId.toString(),
    body: truncatePreview(original.body),
  }
}
