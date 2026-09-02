import { beforeEach, describe, expect, it } from 'vitest'
import { DeclineUseCase } from './decline'
import { InMemoryFriendshipRepository } from 'test/repositories/in-memory-friendship-repository'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { makeUser } from 'test/factories/make-user'
import { makeFriendship } from 'test/factories/make-friendship'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

let inMemoryFriendshipRepository: InMemoryFriendshipRepository
let inMemoryUserRepository: InMemoryUserRepository

let sut: DeclineUseCase

describe('Decline Friend Invite', () => {
  beforeEach(() => {
    inMemoryFriendshipRepository = new InMemoryFriendshipRepository()
    inMemoryUserRepository = new InMemoryUserRepository()

    sut = new DeclineUseCase(
      inMemoryFriendshipRepository,
      inMemoryUserRepository
    )
  })

  it('should be able to decline a pending friend invite', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('recipient-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship(
        { senderId: 'sender-1', recipientId: 'recipient-1', status: 'pending' },
        new UniqueEntityId('friendship-1')
      )
    )

    const result = await sut.execute({
      userId: 'recipient-1',
      friendshipId: 'friendship-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryFriendshipRepository.items[0].status).toBe('rejected')
  })

  it('should not be able to decline when the requesting user does not exist', async () => {
    await inMemoryFriendshipRepository.create(
      makeFriendship(
        { senderId: 'sender-1', recipientId: 'recipient-1' },
        new UniqueEntityId('friendship-1')
      )
    )

    const result = await sut.execute({
      userId: 'ghost',
      friendshipId: 'friendship-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to decline a friendship that does not exist', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('recipient-1'))
    )

    const result = await sut.execute({
      userId: 'recipient-1',
      friendshipId: 'ghost',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to decline a friendship addressed to another user', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('intruder-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship(
        { senderId: 'sender-1', recipientId: 'recipient-1', status: 'pending' },
        new UniqueEntityId('friendship-1')
      )
    )

    const result = await sut.execute({
      userId: 'intruder-1',
      friendshipId: 'friendship-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryFriendshipRepository.items[0].status).toBe('pending')
  })

  it('should not be able to decline a friendship that is not pending', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('recipient-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship(
        {
          senderId: 'sender-1',
          recipientId: 'recipient-1',
          status: 'accepted',
        },
        new UniqueEntityId('friendship-1')
      )
    )

    const result = await sut.execute({
      userId: 'recipient-1',
      friendshipId: 'friendship-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryFriendshipRepository.items[0].status).toBe('accepted')
  })
})
