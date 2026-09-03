import { InMemoryNotificationsRepository } from 'test/repositories/in-memory-notification-repository'
import { makeUser } from '../../../../../test/factories/make-user'
import { InMemoryUserRepository } from '../../../../../test/repositories/in-memory-user-repository'
import { beforeEach, describe, expect, it } from 'vitest'
import { FetchNotificationsUseCase } from './fetch-notification'
import { makeNotification } from 'test/factories/make-notification'

let inMemoryNotificationRepository: InMemoryNotificationsRepository
let inMemoryUserRepository: InMemoryUserRepository
let sut: FetchNotificationsUseCase

describe('Fetch Notifications', () => {
  beforeEach(() => {
    inMemoryNotificationRepository = new InMemoryNotificationsRepository()
    inMemoryUserRepository = new InMemoryUserRepository()
    sut = new FetchNotificationsUseCase(inMemoryNotificationRepository)
  })

  it('should be able to fetch a notifications', async () => {
    const user = makeUser()

    await inMemoryNotificationRepository.create(
      makeNotification({
        recipientId: user.id,
        readAt: null,
      })
    )

    await inMemoryNotificationRepository.create(
      makeNotification({
        recipientId: user.id,
        readAt: null,
      })
    )

    const result = await sut.execute({
      userId: user.id.toString(),
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryNotificationRepository.items).toHaveLength(2)
  })

  it('should not be able to fetch a notifications read', async () => {
    const user = makeUser()

    await inMemoryNotificationRepository.create(
      makeNotification({
        recipientId: user.id,
        title: 'test-1',
        readAt: null,
      })
    )

    const notification = makeNotification({
      recipientId: user.id,
      title: 'test-2',
      readAt: null,
    })

    await inMemoryNotificationRepository.create(notification)

    notification.read()

    await inMemoryNotificationRepository.save(notification)

    const result = await sut.execute({
      userId: user.id.toString(),
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.notifications).toHaveLength(1)
    }
  })
})
