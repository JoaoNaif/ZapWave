import { EventHandler } from '@/core/events/event-handler'
import { DomainEvents } from '@/core/events/domain-events'
import { FriendAcceptedEvent } from '@/domain/social/events/friend-accepted-event'
import { SendNotificationUseCase } from '../use-cases/send-notification'

export class OnFriendshipAccepted implements EventHandler {
  constructor(private sendNotification: SendNotificationUseCase) {
    this.setupSubscriptions()
  }

  setupSubscriptions(): void {
    DomainEvents.register(
      this.sendFriendshipAcceptedNotification.bind(this),
      FriendAcceptedEvent.name
    )
  }

  private async sendFriendshipAcceptedNotification({
    friendship,
  }: FriendAcceptedEvent) {
    await this.sendNotification.execute({
      recipientId: friendship.senderId,
      title: 'Pedido de amizade aceito',
      content: `${friendship.recipientId} aceitou seu pedido de amizade`,
    })
  }
}
