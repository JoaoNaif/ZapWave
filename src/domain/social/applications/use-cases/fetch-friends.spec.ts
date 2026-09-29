import { beforeEach, describe, expect, it } from 'vitest'
import { FetchFriendsUseCase } from './fetch-friends'
import { InMemoryFriendshipRepository } from 'test/repositories/in-memory-friendship-repository'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { FakePresence } from 'test/gateways/fake-presence'
import { makeUser } from 'test/factories/make-user'
import { makeFriendship } from 'test/factories/make-friendship'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'

let inMemoryFriendshipRepository: InMemoryFriendshipRepository
let inMemoryUserRepository: InMemoryUserRepository
let fakePresence: FakePresence

let sut: FetchFriendsUseCase

describe('Fetch Friends', () => {
  beforeEach(() => {
    inMemoryFriendshipRepository = new InMemoryFriendshipRepository()
    inMemoryUserRepository = new InMemoryUserRepository()
    fakePresence = new FakePresence()

    sut = new FetchFriendsUseCase(
      inMemoryFriendshipRepository,
      inMemoryUserRepository,
      fakePresence
    )
  })

  it('should be able to fetch friends from sent and received friendships', async () => {
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Bruno' }, new UniqueEntityId('friend-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Ana' }, new UniqueEntityId('friend-2'))
    )

    // um pedido que o usuário enviou, outro que ele recebeu
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'friend-2',
        recipientId: 'user-1',
        status: 'accepted',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      // ordenado por displayName
      expect(result.value.friends.map((friend) => friend.id)).toEqual([
        'friend-2',
        'friend-1',
      ])
    }
  })

  it('should not list pending or rejected friendships', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('friend-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('friend-2'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'pending',
      })
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'friend-2',
        recipientId: 'user-1',
        status: 'rejected',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friends).toEqual([])
    }
  })

  it('should not list friendships of other users', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('stranger-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'stranger-1',
        recipientId: 'stranger-2',
        status: 'accepted',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friends).toEqual([])
    }
  })

  it('should tell which friends are online', async () => {
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Ana' }, new UniqueEntityId('friend-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Bruno' }, new UniqueEntityId('friend-2'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-2',
        status: 'accepted',
      })
    )

    await fakePresence.heartbeat('friend-1')

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friends).toEqual([
        expect.objectContaining({ id: 'friend-1', online: true }),
        expect.objectContaining({ id: 'friend-2', online: false }),
      ])
    }
  })

  it('should never expose private fields', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('friend-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(Object.keys(result.value.friends[0]).sort()).toEqual([
        'displayName',
        'id',
        'online',
        'username',
      ])
    }
  })
})
