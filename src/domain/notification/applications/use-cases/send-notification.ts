import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { NotificationsRepository } from '../repositories/notification-repository'
import { Notification } from '../../entities/notification'
import { NotificationDto } from '../dtos/notification-dto'
import { NotificationMapper } from '../mappers/notification-mapper'

export interface SendNotificationUseCaseRequest {
  recipientId: string
  title: string
  content: string
}

export type SendNotificationUseCaseResponse = Either<
  null,
  {
    notification: NotificationDto
  }
>

@Injectable()
export class SendNotificationUseCase {
  constructor(private notificationsRepository: NotificationsRepository) {}

  async execute({
    recipientId,
    title,
    content,
  }: SendNotificationUseCaseRequest): Promise<SendNotificationUseCaseResponse> {
    const notification = Notification.create({
      recipientId: new UniqueEntityId(recipientId),
      title,
      content,
    })

    await this.notificationsRepository.create(notification)

    return right({
      notification: NotificationMapper.toDto(notification),
    })
  }
}
