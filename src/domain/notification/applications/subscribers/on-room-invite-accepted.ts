import { EventHandler } from '@/core/events/event-handler'
import { DomainEvents } from '@/core/events/domain-events'
import { RoomInviteAcceptedEvent } from '@/domain/rooms/events/room-invite-accepted-event'
import { SendNotificationUseCase } from '../use-cases/send-notification'

export class OnRoomInviteAccepted implements EventHandler {
  constructor(private sendNotification: SendNotificationUseCase) {
    this.setupSubscriptions()
  }

  setupSubscriptions(): void {
    DomainEvents.register(
      this.sendRoomInviteAcceptedNotification.bind(this),
      RoomInviteAcceptedEvent.name
    )
  }

  private async sendRoomInviteAcceptedNotification({
    roomInvite,
  }: RoomInviteAcceptedEvent) {
    await this.sendNotification.execute({
      recipientId: roomInvite.inviterId.toString(),
      title: 'Convite de sala aceito',
      content: `${roomInvite.inviteeId.toString()} aceitou seu convite de sala`,
    })
  }
}
