import { beforeEach, describe, expect, it } from 'vitest'
import { DeclineRoomInviteUseCase } from './decline-room-invite'
import { InMemoryRoomInviteRepository } from 'test/repositories/in-memory-room-invite-repository'
import { makeRoomInvite } from 'test/factories/make-room-invite'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

let inMemoryRoomInviteRepository: InMemoryRoomInviteRepository

let sut: DeclineRoomInviteUseCase

describe('Decline Room Invite', () => {
  beforeEach(() => {
    inMemoryRoomInviteRepository = new InMemoryRoomInviteRepository()

    sut = new DeclineRoomInviteUseCase(inMemoryRoomInviteRepository)
  })

  it('should be able to decline a pending room invite', async () => {
    await inMemoryRoomInviteRepository.create(
      makeRoomInvite(
        { inviteeId: new UniqueEntityId('user-1') },
        new UniqueEntityId('invite-1')
      )
    )

    const result = await sut.execute({ userId: 'user-1', inviteId: 'invite-1' })

    expect(result.isRight()).toBe(true)
    expect(inMemoryRoomInviteRepository.items[0].status).toBe('declined')
    expect(inMemoryRoomInviteRepository.items[0].respondedAt).toBeInstanceOf(
      Date
    )
  })

  it('should not be able to decline an invite that does not exist', async () => {
    const result = await sut.execute({ userId: 'user-1', inviteId: 'ghost' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to decline an invite addressed to another user', async () => {
    await inMemoryRoomInviteRepository.create(
      makeRoomInvite(
        { inviteeId: new UniqueEntityId('user-1') },
        new UniqueEntityId('invite-1')
      )
    )

    const result = await sut.execute({
      userId: 'intruder-1',
      inviteId: 'invite-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryRoomInviteRepository.items[0].status).toBe('pending')
  })

  it('should not be able to decline an invite that is not pending', async () => {
    await inMemoryRoomInviteRepository.create(
      makeRoomInvite(
        { inviteeId: new UniqueEntityId('user-1'), status: 'accepted' },
        new UniqueEntityId('invite-1')
      )
    )

    const result = await sut.execute({ userId: 'user-1', inviteId: 'invite-1' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryRoomInviteRepository.items[0].status).toBe('accepted')
  })
})
