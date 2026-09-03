import { Notification } from '../../entities/notification'

export abstract class NotificationsRepository {
  abstract findById(id: string): Promise<Notification | null>
  abstract findManyNotifications(userId: string): Promise<Notification[]>
  abstract create(notification: Notification): Promise<void>
  abstract save(notification: Notification): Promise<void>
}
