import { NotificationsRepository } from '@/domain/notification/applications/repositories/notification-repository'
import { Notification } from '@/domain/notification/entities/notification'

export class InMemoryNotificationsRepository implements NotificationsRepository {
  public items: Notification[] = []

  async findById(id: string) {
    const notification = this.items.find((item) => item.id.toString() === id)

    if (!notification) {
      return null
    }

    return notification
  }

  async findManyNotifications(userId: string) {
    const notifications = this.items
      .filter(
        (notification) =>
          notification.recipientId.toString() === userId && !notification.readAt
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    return notifications
  }

  async create(notification: Notification) {
    this.items.push(notification)
  }

  async save(notification: Notification) {
    const itemIndex = this.items.findIndex(
      (item) => item.id === notification.id
    )

    this.items[itemIndex] = notification
  }
}
