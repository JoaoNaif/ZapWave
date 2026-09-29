import { beforeEach, describe, expect, it } from 'vitest'
import { FetchRoomInvitesUseCase } from './fetch-room-invites'
import { InMemoryRoomInviteRepository } from 'test/repositories/in-memory-room-invite-repository'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { makeRoomInvite } from 'test/factories/make-room-invite'
import { makeConversation } from 'test/factories/make-conversation'
import { makeUser } from 'test/factories/make-user'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'

let inMemoryRoomInviteRepository: InMemoryRoomInviteRepository
let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryUserRepository: InMemoryUserRepository

let sut: FetchRoomInvitesUseCase

describe('Fetch Room Invites', () => {
  beforeEach(() => {
    inMemoryRoomInviteRepository = new InMemoryRoomInviteRepository()
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryUserRepository = new InMemoryUserRepository()

    sut = new FetchRoomInvitesUseCase(
      inMemoryRoomInviteRepository,
      inMemoryConversationRepository,
      inMemoryUserRepository
    )
  })

  it('should be able to fetch received pending invites, most recent first', async () => {
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Ana' }, new UniqueEntityId('inviter-1'))
    )
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'team-zapwave' },
        new UniqueEntityId('room-1')
      )
    )
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'familia' },
        new UniqueEntityId('room-2')
      )
    )

    await inMemoryRoomInviteRepository.create(
      makeRoomInvite(
        {
          conversationId: new UniqueEntityId('room-1'),
          inviterId: new UniqueEntityId('inviter-1'),
          inviteeId: new UniqueEntityId('user-1'),
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
        new UniqueEntityId('invite-1')
      )
    )
    await inMemoryRoomInviteRepository.create(
      makeRoomInvite(
        {
          conversationId: new UniqueEntityId('room-2'),
          inviterId: new UniqueEntityId('inviter-1'),
          inviteeId: new UniqueEntityId('user-1'),
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
        new UniqueEntityId('invite-2')
      )
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.roomInvites).toEqual([
        {
          inviteId: 'invite-2',
          room: { id: 'room-2', name: 'familia' },
          inviter: expect.objectContaining({
            id: 'inviter-1',
            displayName: 'Ana',
          }),
          createdAt: new Date('2026-09-02T10:00:00Z'),
        },
        {
          inviteId: 'invite-1',
          room: { id: 'room-1', name: 'team-zapwave' },
          inviter: expect.objectContaining({ id: 'inviter-1' }),
          createdAt: new Date('2026-09-01T10:00:00Z'),
        },
      ])
    }
  })

  it('should not list invites that were already answered', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('inviter-1'))
    )
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )

    for (const status of ['accepted', 'declined', 'revoked'] as const) {
      await inMemoryRoomInviteRepository.create(
        makeRoomInvite({
          conversationId: new UniqueEntityId('room-1'),
          inviterId: new UniqueEntityId('inviter-1'),
          inviteeId: new UniqueEntityId(`user-${status}`),
          status,
        })
      )
    }

    for (const status of ['accepted', 'declined', 'revoked']) {
      const result = await sut.execute({ userId: `user-${status}` })

      expect(result.isRight()).toBe(true)
      if (result.isRight()) {
        expect(result.value.roomInvites).toEqual([])
      }
    }
  })

  it('should not list invites sent to other users', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('user-1'))
    )
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )

    // user-1 convidou alguém: o convite é do outro, não dele
    await inMemoryRoomInviteRepository.create(
      makeRoomInvite({
        conversationId: new UniqueEntityId('room-1'),
        inviterId: new UniqueEntityId('user-1'),
        inviteeId: new UniqueEntityId('other-1'),
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.roomInvites).toEqual([])
    }
  })

  it('should never expose private fields of the inviter', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('inviter-1'))
    )
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )
    await inMemoryRoomInviteRepository.create(
      makeRoomInvite({
        conversationId: new UniqueEntityId('room-1'),
        inviterId: new UniqueEntityId('inviter-1'),
        inviteeId: new UniqueEntityId('user-1'),
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(Object.keys(result.value.roomInvites[0].inviter).sort()).toEqual([
        'displayName',
        'id',
        'username',
      ])
    }
  })
})
