import { beforeEach, describe, expect, it } from 'vitest'
import { InviteToRoomUseCase } from './invite-to-room'
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

let sut: InviteToRoomUseCase

describe('Invite To Room', () => {
  beforeEach(() => {
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryRoomInviteRepository = new InMemoryRoomInviteRepository()

    sut = new InviteToRoomUseCase(
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository,
      inMemoryRoomInviteRepository
    )
  })

  async function makeRoomWithOwner(ownerId = 'owner-1') {
    const room = makeConversation(
      { type: 'room', name: 'team-zapwave' },
      new UniqueEntityId('room-1')
    )
    await inMemoryConversationRepository.create(room)

    const owner = makeConversationMember({
      conversationId: room.id,
      userId: new UniqueEntityId(ownerId),
      role: 'owner',
    })
    await inMemoryConversationMemberRepository.create(owner)

    return { room, owner }
  }

  it('should be able to invite a user to a room', async () => {
    const { room } = await makeRoomWithOwner()

    const result = await sut.execute({
      conversationId: room.id.toString(),
      senderId: 'owner-1',
      recipientId: 'user-2',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryRoomInviteRepository.items).toHaveLength(1)

    if (result.isRight()) {
      expect(result.value.invite.status).toBe('pending')
      expect(result.value.invite.inviteeId.toString()).toBe('user-2')
      expect(result.value.invite.inviterId.toString()).toBe('owner-1')
      expect(result.value.invite.conversationId).toEqual(room.id)
      expect(result.value.room).toBe(room)
    }
  })

  it('should persist the invite with the id returned in the result', async () => {
    const { room } = await makeRoomWithOwner()

    const result = await sut.execute({
      conversationId: room.id.toString(),
      senderId: 'owner-1',
      recipientId: 'user-2',
    })

    if (result.isRight()) {
      expect(inMemoryRoomInviteRepository.items[0].id).toEqual(
        result.value.invite.id
      )
    }
  })

  it('should allow an admin to invite a user', async () => {
    const { room } = await makeRoomWithOwner()

    const admin = makeConversationMember({
      conversationId: room.id,
      userId: new UniqueEntityId('admin-1'),
      role: 'admin',
    })
    await inMemoryConversationMemberRepository.create(admin)

    const result = await sut.execute({
      conversationId: room.id.toString(),
      senderId: 'admin-1',
      recipientId: 'user-2',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryRoomInviteRepository.items).toHaveLength(1)
  })

  it('should not be able to invite when the conversation does not exist', async () => {
    const result = await sut.execute({
      conversationId: 'non-existing-room',
      senderId: 'owner-1',
      recipientId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
    expect(inMemoryRoomInviteRepository.items).toHaveLength(0)
  })

  it('should not be able to invite when the conversation is not a room', async () => {
    const dm = makeConversation(
      { type: 'dm', name: null },
      new UniqueEntityId('dm-1')
    )
    await inMemoryConversationRepository.create(dm)

    const result = await sut.execute({
      conversationId: dm.id.toString(),
      senderId: 'owner-1',
      recipientId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to invite when the sender is not a member of the room', async () => {
    const { room } = await makeRoomWithOwner()

    const result = await sut.execute({
      conversationId: room.id.toString(),
      senderId: 'stranger-1',
      recipientId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to invite when the sender is a regular member', async () => {
    const { room } = await makeRoomWithOwner()

    const member = makeConversationMember({
      conversationId: room.id,
      userId: new UniqueEntityId('member-1'),
      role: 'member',
    })
    await inMemoryConversationMemberRepository.create(member)

    const result = await sut.execute({
      conversationId: room.id.toString(),
      senderId: 'member-1',
      recipientId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryRoomInviteRepository.items).toHaveLength(0)
  })

  it('should not be able to invite a user who is already a member', async () => {
    const { room } = await makeRoomWithOwner()

    const member = makeConversationMember({
      conversationId: room.id,
      userId: new UniqueEntityId('user-2'),
      role: 'member',
    })
    await inMemoryConversationMemberRepository.create(member)

    const result = await sut.execute({
      conversationId: room.id.toString(),
      senderId: 'owner-1',
      recipientId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceAlreadyExistsError)
    expect(inMemoryRoomInviteRepository.items).toHaveLength(0)
  })

  it('should not be able to invite a user who already has a pending invite', async () => {
    const { room } = await makeRoomWithOwner()

    const existingInvite = makeRoomInvite({
      conversationId: room.id,
      inviteeId: new UniqueEntityId('user-2'),
      inviterId: new UniqueEntityId('owner-1'),
      status: 'pending',
    })
    await inMemoryRoomInviteRepository.create(existingInvite)

    const result = await sut.execute({
      conversationId: room.id.toString(),
      senderId: 'owner-1',
      recipientId: 'user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceAlreadyExistsError)
    expect(inMemoryRoomInviteRepository.items).toHaveLength(1)
  })
})
