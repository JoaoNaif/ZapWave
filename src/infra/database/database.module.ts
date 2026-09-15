import { Module } from '@nestjs/common'
import { PrismaService } from './prisma/prisma.service'
import { UserRepository } from '@/domain/accounts/applications/repositories/user-repository'
import { PrismaUserRepository } from './prisma/repositories/prisma-user-repository'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { PrismaConversationRepository } from './prisma/repositories/prisma-conversation-repository'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { PrismaConversationMemberRepository } from './prisma/repositories/prisma-conversation-member-repository'
import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { PrismaDevicesRepository } from './prisma/repositories/prisma-device-repository'
import { FriendshipRepository } from '@/domain/social/applications/repositories/friendship-repository'
import { PrismaFriendshipRepository } from './prisma/repositories/prisma-friendship-repository'
import { MessageRepository } from '@/domain/chat/applications/repositories/message-repository'
import { PrismaMessageRepository } from './prisma/repositories/prisma-message-repository'
import { RoomInviteRepository } from '@/domain/rooms/applications/repositories/room-invite-repository'
import { PrismaRoomInviteRepository } from './prisma/repositories/prisma-room-invite-repository'
import { NotificationsRepository } from '@/domain/notification/applications/repositories/notification-repository'
import { PrismaNotificationsRepository } from './prisma/repositories/prisma-notification-repository'

@Module({
  providers: [
    PrismaService,
    {
      provide: UserRepository,
      useClass: PrismaUserRepository,
    },
    {
      provide: ConversationRepository,
      useClass: PrismaConversationRepository,
    },
    {
      provide: ConversationMemberRepository,
      useClass: PrismaConversationMemberRepository,
    },
    {
      provide: DevicesRepository,
      useClass: PrismaDevicesRepository,
    },
    {
      provide: FriendshipRepository,
      useClass: PrismaFriendshipRepository,
    },
    {
      provide: MessageRepository,
      useClass: PrismaMessageRepository,
    },
    {
      provide: RoomInviteRepository,
      useClass: PrismaRoomInviteRepository,
    },
    {
      provide: NotificationsRepository,
      useClass: PrismaNotificationsRepository,
    },
  ],
  exports: [
    UserRepository,
    ConversationRepository,
    ConversationMemberRepository,
    DevicesRepository,
    FriendshipRepository,
    MessageRepository,
    RoomInviteRepository,
    NotificationsRepository,
  ],
})
export class DatabaseModule {}
