import { beforeEach, describe, expect, it } from 'vitest'
import { SendFriendInviteUseCase } from './send-friend-invite'
import { InMemoryFriendshipRepository } from 'test/repositories/in-memory-friendship-repository'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { makeUser } from 'test/factories/make-user'
import { makeFriendship } from 'test/factories/make-friendship'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { InviteAlreadyExistsError } from '../errors/invite-already-error'

let inMemoryFriendshipRepository: InMemoryFriendshipRepository
let inMemoryUserRepository: InMemoryUserRepository

let sut: SendFriendInviteUseCase

describe('Send Friend Invite', () => {
  beforeEach(() => {
    inMemoryFriendshipRepository = new InMemoryFriendshipRepository()
    inMemoryUserRepository = new InMemoryUserRepository()

    sut = new SendFriendInviteUseCase(
      inMemoryFriendshipRepository,
      inMemoryUserRepository
    )
  })

  it('should be able to send a friend invite', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('sender-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('recipient-1'))
    )

    const result = await sut.execute({
      senderId: 'sender-1',
      recipientId: 'recipient-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friendship.status).toBe('pending')
      expect(result.value.friendship.senderId).toBe('sender-1')
      expect(result.value.friendship.recipientId).toBe('recipient-1')
    }
    expect(inMemoryFriendshipRepository.items).toHaveLength(1)
  })

  it('should not be able to send a friend invite to yourself', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('sender-1'))
    )

    const result = await sut.execute({
      senderId: 'sender-1',
      recipientId: 'sender-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryFriendshipRepository.items).toHaveLength(0)
  })

  it('should not be able to send a friend invite when the sender does not exist', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('recipient-1'))
    )

    const result = await sut.execute({
      senderId: 'ghost',
      recipientId: 'recipient-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to send a friend invite when the recipient does not exist', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('sender-1'))
    )

    const result = await sut.execute({
      senderId: 'sender-1',
      recipientId: 'ghost',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to send a friend invite that already exists', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('sender-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('recipient-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({ senderId: 'sender-1', recipientId: 'recipient-1' })
    )

    const result = await sut.execute({
      senderId: 'sender-1',
      recipientId: 'recipient-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(InviteAlreadyExistsError)
    expect(inMemoryFriendshipRepository.items).toHaveLength(1)
  })

  it('should not be able to send a friend invite when the reverse invite already exists', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('sender-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('recipient-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({ senderId: 'recipient-1', recipientId: 'sender-1' })
    )

    const result = await sut.execute({
      senderId: 'sender-1',
      recipientId: 'recipient-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(InviteAlreadyExistsError)
    expect(inMemoryFriendshipRepository.items).toHaveLength(1)
  })
})
