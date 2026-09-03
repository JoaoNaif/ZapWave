import { beforeEach, describe, expect, it, vi, MockInstance } from 'vitest'
import { makeFriendship } from 'test/factories/make-friendship'
import { InMemoryFriendshipRepository } from 'test/repositories/in-memory-friendship-repository'
import { InMemoryNotificationsRepository } from 'test/repositories/in-memory-notification-repository'
import {
  SendNotificationUseCase,
  SendNotificationUseCaseRequest,
  SendNotificationUseCaseResponse,
} from '../use-cases/send-notification'
import { OnFriendshipCreated } from './on-friendship-created'

let inMemoryFriendshipRepository: InMemoryFriendshipRepository
let inMemoryNotificationsRepository: InMemoryNotificationsRepository
let sendNotificationUseCase: SendNotificationUseCase

let sendNotificationExecuteSpy: MockInstance<
  (
    request: SendNotificationUseCaseRequest
  ) => Promise<SendNotificationUseCaseResponse>
>

describe('On Friendship Created', () => {
  beforeEach(() => {
    inMemoryFriendshipRepository = new InMemoryFriendshipRepository()
    inMemoryNotificationsRepository = new InMemoryNotificationsRepository()
    sendNotificationUseCase = new SendNotificationUseCase(
      inMemoryNotificationsRepository
    )

    sendNotificationExecuteSpy = vi.spyOn(sendNotificationUseCase, 'execute')

    new OnFriendshipCreated(sendNotificationUseCase)
  })

  it('should send a notification to the recipient when a friendship is created', async () => {
    const friendship = makeFriendship()

    await inMemoryFriendshipRepository.create(friendship)

    expect(sendNotificationExecuteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: friendship.recipientId,
      })
    )

    expect(inMemoryNotificationsRepository.items).toHaveLength(1)
    expect(inMemoryNotificationsRepository.items[0].recipientId.toString()).toBe(
      friendship.recipientId
    )
  })
})
