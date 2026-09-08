import { beforeEach, describe, expect, it, vi, MockInstance } from 'vitest'
import { makeFriendship } from 'test/factories/make-friendship'
import { InMemoryFriendshipRepository } from 'test/repositories/in-memory-friendship-repository'
import { InMemoryNotificationsRepository } from 'test/repositories/in-memory-notification-repository'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import {
  SendNotificationUseCase,
  SendNotificationUseCaseRequest,
  SendNotificationUseCaseResponse,
} from '../use-cases/send-notification'
import { OnFriendshipAccepted } from './on-friendship-accepted'

let inMemoryFriendshipRepository: InMemoryFriendshipRepository
let inMemoryNotificationsRepository: InMemoryNotificationsRepository
let sendNotificationUseCase: SendNotificationUseCase

let sendNotificationExecuteSpy: MockInstance<
  (
    request: SendNotificationUseCaseRequest
  ) => Promise<SendNotificationUseCaseResponse>
>

describe('On Friendship Accepted', () => {
  beforeEach(() => {
    inMemoryFriendshipRepository = new InMemoryFriendshipRepository()
    inMemoryNotificationsRepository = new InMemoryNotificationsRepository()
    sendNotificationUseCase = new SendNotificationUseCase(
      inMemoryNotificationsRepository
    )

    sendNotificationExecuteSpy = vi.spyOn(sendNotificationUseCase, 'execute')

    new OnFriendshipAccepted(sendNotificationUseCase)
  })

  it('should send a notification to the sender when the friendship is accepted', async () => {
    const friendship = makeFriendship(
      { senderId: 'sender-1', recipientId: 'recipient-1', status: 'pending' },
      new UniqueEntityId('friendship-1')
    )

    await inMemoryFriendshipRepository.create(friendship)

    friendship.accept()
    await inMemoryFriendshipRepository.save(friendship)

    expect(sendNotificationExecuteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'sender-1',
      })
    )

    expect(inMemoryNotificationsRepository.items).toHaveLength(1)
    expect(
      inMemoryNotificationsRepository.items[0].recipientId.toString()
    ).toBe('sender-1')
  })
})
