import { Logger, Module, OnModuleInit } from '@nestjs/common'
import { DomainEvents } from '@/core/events/domain-events'
import { SendNotificationUseCase } from '@/domain/notification/applications/use-cases/send-notification'
import { OnFriendshipAccepted } from '@/domain/notification/applications/subscribers/on-friendship-accepted'
import { OnFriendshipCreated } from '@/domain/notification/applications/subscribers/on-friendship-created'
import { OnRoomInviteAccepted } from '@/domain/notification/applications/subscribers/on-room-invite-accepted'
import { OnRoomInviteCreated } from '@/domain/notification/applications/subscribers/on-room-invite-created'
import { DatabaseModule } from '../database/database.module'

// Os subscribers se registram no DomainEvents dentro do próprio construtor
// (não têm decorator do Nest — o domain não conhece o Nest). Sem estar aqui
// como provider, ninguém dá `new` neles e nenhuma notificação é criada. O Nest
// instancia todo provider na subida do app, mesmo que ninguém o injete.
@Module({
  imports: [DatabaseModule],
  providers: [
    SendNotificationUseCase,
    {
      provide: OnFriendshipCreated,
      useFactory: (sendNotification: SendNotificationUseCase) =>
        new OnFriendshipCreated(sendNotification),
      inject: [SendNotificationUseCase],
    },
    {
      provide: OnFriendshipAccepted,
      useFactory: (sendNotification: SendNotificationUseCase) =>
        new OnFriendshipAccepted(sendNotification),
      inject: [SendNotificationUseCase],
    },
    {
      provide: OnRoomInviteCreated,
      useFactory: (sendNotification: SendNotificationUseCase) =>
        new OnRoomInviteCreated(sendNotification),
      inject: [SendNotificationUseCase],
    },
    {
      provide: OnRoomInviteAccepted,
      useFactory: (sendNotification: SendNotificationUseCase) =>
        new OnRoomInviteAccepted(sendNotification),
      inject: [SendNotificationUseCase],
    },
  ],
})
export class NotificationModule implements OnModuleInit {
  private readonly logger = new Logger(NotificationModule.name)

  onModuleInit() {
    // uma notificação que falha não pode derrubar o servidor (ver DomainEvents)
    DomainEvents.onHandlerError = (error, event) =>
      this.logger.error(
        `falha ao tratar ${event.constructor.name}: ${error instanceof Error ? error.message : error}`
      )
  }
}
