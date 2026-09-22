import { Notification } from '../../entities/notification'
import { NotificationDto } from '../dtos/notification-dto'

export class NotificationMapper {
  static toDto(notification: Notification): NotificationDto {
    return {
      id: notification.id.toString(),
      recipientId: notification.recipientId.toString(),
      title: notification.title,
      content: notification.content,
      readAt: notification.readAt ?? null,
      createdAt: notification.createdAt,
    }
  }
}
