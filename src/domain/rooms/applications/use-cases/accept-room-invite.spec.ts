import { beforeEach, describe, expect, it } from 'vitest'
import { AcceptRoomInviteUseCase } from './accept-room-invite'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { InMemoryRoomInviteRepository } from 'test/repositories/in-memory-room-invite-repository'
import { makeConversation } from 'test/factories/make-conversation'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { makeRoomInvite } from 'test/factories/make-room-invite'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'

let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository
let inMemoryRoomInviteRepository: InMemoryRoomInviteRepository

let sut: AcceptRoomInviteUseCase

describe('Accept Room Invite', () => {
  beforeEach(() => {
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryRoomInviteRepository = new InMemoryRoomInviteRepository()

    sut = new AcceptRoomInviteUseCase(
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository,
      inMemoryRoomInviteRepository
    )
  })

  async function makeRoom() {
    const room = makeConversation(
      { type: 'room', name: 'team-zapwave' },
      new UniqueEntityId('room-1')
    )
    await inMemoryConversationRepository.create(room)

    return room
  }

  it('should be able to accept a pending invite', async () => {
    const room = await makeRoom()

    const invite = makeRoomInvite(
      {
        conversationId: room.id,
        inviteeId: new UniqueEntityId('user-2'),
        inviterId: new UniqueEntityId('owner-1'),
        status: 'pending',
      },
      new UniqueEntityId('invite-1')
    )
    await inMemoryRoomInviteRepository.create(invite)

    const result = await sut.execute({
      inviteId: 'invite-1',
      userId: 'user-2',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)

    if (result.isRight()) {
      expect(result.value.member.role).toBe('member')
      expect(result.value.member.userId.toString()).toBe('user-2')
      expect(result.value.member.conversationId).toEqual(room.id)
      expect(result.value.member.lastReadMessageId).toBeNull()
      expect(result.value.room).toBe(room)
      expect(result.value.invite.status).toBe('accepted')
      expect(result.value.invite.respondedAt).toBeInstanceOf(Date)
    }
  })

  it('should mark the stored invite as accepted', async () => {
    const room = await makeRoom()

    const invite = makeRoomInvite(
      {
        conversationId: room.id,
        inviteeId: new UniqueEntityId('user-2'),
        status: 'pending',
      },
      new UniqueEntityId('invite-1')
    )
    await inMemoryRoomInviteRepository.create(invite)

    await sut.execute({ inviteId: 'invite-1', userId: 'user-2' })

    expect(inMemoryRoomInviteRepository.items[0].status).toBe('accepted')
    expect(inMemoryRoomInviteRepository.items[0].respondedAt).toBeInstanceOf(
      Date
    )
  })

  it('should not be able to accept an invite that does not exist', async () => {
    const result = await sut.execute({
      inviteId: 'non-existing-invite',
      userId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(0)
  })

  it('should not be able to accept an invite addressed to another user', async () => {
    const room = await makeRoom()

    const invite = makeRoomInvite(
      {
        conversationId: room.id,
        inviteeId: new UniqueEntityId('user-2'),
        status: 'pending',
      },
      new UniqueEntityId('invite-1')
    )
    await inMemoryRoomInviteRepository.create(invite)

    const result = await sut.execute({
      inviteId: 'invite-1',
      userId: 'intruder-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(0)
  })

  it('should not be able to accept an invite that is not pending', async () => {
    const room = await makeRoom()

    const invite = makeRoomInvite(
      {
        conversationId: room.id,
        inviteeId: new UniqueEntityId('user-2'),
        status: 'revoked',
      },
      new UniqueEntityId('invite-1')
    )
    await inMemoryRoomInviteRepository.create(invite)

    const result = await sut.execute({
      inviteId: 'invite-1',
      userId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(0)
  })

  it('should not be able to accept an invite whose room no longer exists', async () => {
    const invite = makeRoomInvite(
      {
        conversationId: new UniqueEntityId('gone-room'),
        inviteeId: new UniqueEntityId('user-2'),
        status: 'pending',
      },
      new UniqueEntityId('invite-1')
    )
    await inMemoryRoomInviteRepository.create(invite)

    const result = await sut.execute({
      inviteId: 'invite-1',
      userId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to accept when the user is already a member', async () => {
    const room = await makeRoom()

    const member = makeConversationMember({
      conversationId: room.id,
      userId: new UniqueEntityId('user-2'),
      role: 'member',
    })
    await inMemoryConversationMemberRepository.create(member)

    const invite = makeRoomInvite(
      {
        conversationId: room.id,
        inviteeId: new UniqueEntityId('user-2'),
        status: 'pending',
      },
      new UniqueEntityId('invite-1')
    )
    await inMemoryRoomInviteRepository.create(invite)

    const result = await sut.execute({
      inviteId: 'invite-1',
      userId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceAlreadyExistsError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)
  })
})
