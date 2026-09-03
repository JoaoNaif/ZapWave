import { Either, right } from '@/core/either'
import { NotificationsRepository } from '../repositories/notification-repository'
import { Notification } from '../../entities/notification'

export interface FetchNotificationsUseCaseRequest {
  userId: string
}

export type FetchNotificationsUseCaseResponse = Either<
  null,
  {
    notifications: Notification[]
  }
>

export class FetchNotificationsUseCase {
  constructor(private notificationRepository: NotificationsRepository) {}

  async execute({
    userId,
  }: FetchNotificationsUseCaseRequest): Promise<FetchNotificationsUseCaseResponse> {
    const notifications =
      await this.notificationRepository.findManyNotifications(userId)

    return right({
      notifications,
    })
  }
}
