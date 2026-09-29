import { beforeEach, describe, expect, it } from 'vitest'
import { FetchFriendRequestsUseCase } from './fetch-friend-requests'
import { InMemoryFriendshipRepository } from 'test/repositories/in-memory-friendship-repository'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { makeUser } from 'test/factories/make-user'
import { makeFriendship } from 'test/factories/make-friendship'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'

let inMemoryFriendshipRepository: InMemoryFriendshipRepository
let inMemoryUserRepository: InMemoryUserRepository

let sut: FetchFriendRequestsUseCase

describe('Fetch Friend Requests', () => {
  beforeEach(() => {
    inMemoryFriendshipRepository = new InMemoryFriendshipRepository()
    inMemoryUserRepository = new InMemoryUserRepository()

    sut = new FetchFriendRequestsUseCase(
      inMemoryFriendshipRepository,
      inMemoryUserRepository
    )
  })

  it('should be able to fetch received pending requests, most recent first', async () => {
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Ana' }, new UniqueEntityId('sender-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Bruno' }, new UniqueEntityId('sender-2'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship(
        {
          senderId: 'sender-1',
          recipientId: 'user-1',
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
        new UniqueEntityId('friendship-1')
      )
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship(
        {
          senderId: 'sender-2',
          recipientId: 'user-1',
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
        new UniqueEntityId('friendship-2')
      )
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friendRequests).toEqual([
        {
          friendshipId: 'friendship-2',
          sender: expect.objectContaining({
            id: 'sender-2',
            displayName: 'Bruno',
          }),
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
        {
          friendshipId: 'friendship-1',
          sender: expect.objectContaining({
            id: 'sender-1',
            displayName: 'Ana',
          }),
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      ])
    }
  })

  it('should not list requests the user sent', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('user-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({ senderId: 'user-1', recipientId: 'other-1' })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friendRequests).toEqual([])
    }
  })

  it('should not list accepted or rejected requests', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('sender-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('sender-2'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'sender-1',
        recipientId: 'user-1',
        status: 'accepted',
      })
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'sender-2',
        recipientId: 'user-1',
        status: 'rejected',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friendRequests).toEqual([])
    }
  })

  it('should never expose private fields of the sender', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('sender-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({ senderId: 'sender-1', recipientId: 'user-1' })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(Object.keys(result.value.friendRequests[0].sender).sort()).toEqual(
        ['displayName', 'id', 'username']
      )
    }
  })
})
