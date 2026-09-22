import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { NotificationsRepository } from '../repositories/notification-repository'
import { NotificationDto } from '../dtos/notification-dto'
import { NotificationMapper } from '../mappers/notification-mapper'

export interface FetchNotificationsUseCaseRequest {
  userId: string
}

export type FetchNotificationsUseCaseResponse = Either<
  null,
  {
    notifications: NotificationDto[]
  }
>

@Injectable()
export class FetchNotificationsUseCase {
  constructor(private notificationRepository: NotificationsRepository) {}

  async execute({
    userId,
  }: FetchNotificationsUseCaseRequest): Promise<FetchNotificationsUseCaseResponse> {
    const notifications =
      await this.notificationRepository.findManyNotifications(userId)

    return right({
      notifications: notifications.map(NotificationMapper.toDto),
    })
  }
}
