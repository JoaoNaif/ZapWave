import { EventHandler } from '@/core/events/event-handler'
import { DomainEvents } from '@/core/events/domain-events'
import { FriendCreatedEvent } from '@/domain/social/events/friend-created-event'
import { SendNotificationUseCase } from '../use-cases/send-notification'

export class OnFriendshipCreated implements EventHandler {
  constructor(private sendNotification: SendNotificationUseCase) {
    this.setupSubscriptions()
  }

  setupSubscriptions(): void {
    DomainEvents.register(
      this.sendFriendshipNotification.bind(this),
      FriendCreatedEvent.name
    )
  }

  private async sendFriendshipNotification({ friendship }: FriendCreatedEvent) {
    await this.sendNotification.execute({
      recipientId: friendship.recipientId,
      title: 'Novo pedido de amizade',
      content: `${friendship.senderId} te enviou um pedido de amizade`,
    })
  }
}
