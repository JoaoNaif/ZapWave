import { EventHandler } from '@/core/events/event-handler'
import { DomainEvents } from '@/core/events/domain-events'
import { RoomInviteCreatedEvent } from '@/domain/rooms/events/room-invite-created-event'
import { SendNotificationUseCase } from '../use-cases/send-notification'

export class OnRoomInviteCreated implements EventHandler {
  constructor(private sendNotification: SendNotificationUseCase) {
    this.setupSubscriptions()
  }

  setupSubscriptions(): void {
    DomainEvents.register(
      this.sendRoomInviteNotification.bind(this),
      RoomInviteCreatedEvent.name
    )
  }

  private async sendRoomInviteNotification({
    roomInvite,
  }: RoomInviteCreatedEvent) {
    await this.sendNotification.execute({
      recipientId: roomInvite.inviteeId.toString(),
      title: 'Novo convite de sala',
      content: `${roomInvite.inviterId.toString()} te convidou para uma sala`,
    })
  }
}
