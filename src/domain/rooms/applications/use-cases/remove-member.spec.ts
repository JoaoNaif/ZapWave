import { beforeEach, describe, expect, it } from 'vitest'
import { RemoveMemberUseCase } from './remove-member'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { makeConversation } from 'test/factories/make-conversation'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository

let sut: RemoveMemberUseCase

describe('Remove Member', () => {
  beforeEach(() => {
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()

    sut = new RemoveMemberUseCase(
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository
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

  async function addMember(
    room: UniqueEntityId,
    userId: string,
    role: 'owner' | 'admin' | 'member'
  ) {
    const member = makeConversationMember({
      conversationId: room,
      userId: new UniqueEntityId(userId),
      role,
    })
    await inMemoryConversationMemberRepository.create(member)

    return member
  }

  it('should let an owner remove a member', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'owner-1', 'owner')
    await addMember(room.id, 'member-1', 'member')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'owner-1',
      targetUserId: 'member-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)
    expect(
      inMemoryConversationMemberRepository.items[0].userId.toString()
    ).toBe('owner-1')
  })

  it('should let an admin remove a member', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'admin-1', 'admin')
    await addMember(room.id, 'member-1', 'member')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'admin-1',
      targetUserId: 'member-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)
  })

  it('should let an owner remove an admin', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'owner-1', 'owner')
    await addMember(room.id, 'admin-1', 'admin')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'owner-1',
      targetUserId: 'admin-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)
  })

  it('should not let an admin remove another admin', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'admin-1', 'admin')
    await addMember(room.id, 'admin-2', 'admin')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'admin-1',
      targetUserId: 'admin-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(2)
  })

  it('should not let anyone remove the owner', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'owner-1', 'owner')
    await addMember(room.id, 'admin-1', 'admin')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'admin-1',
      targetUserId: 'owner-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(2)
  })

  it('should not let a regular member remove anyone', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'member-1', 'member')
    await addMember(room.id, 'member-2', 'member')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'member-1',
      targetUserId: 'member-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(2)
  })

  it('should not let the actor remove themselves', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'admin-1', 'admin')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'admin-1',
      targetUserId: 'admin-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)
  })

  it('should not remove from a conversation that does not exist', async () => {
    const result = await sut.execute({
      conversationId: 'non-existing-room',
      actorId: 'owner-1',
      targetUserId: 'member-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not remove from a conversation that is not a room', async () => {
    const dm = makeConversation(
      { type: 'dm', name: null },
      new UniqueEntityId('dm-1')
    )
    await inMemoryConversationRepository.create(dm)

    const result = await sut.execute({
      conversationId: dm.id.toString(),
      actorId: 'owner-1',
      targetUserId: 'member-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not remove when the actor is not a member of the room', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'member-1', 'member')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'stranger-1',
      targetUserId: 'member-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)
  })

  it('should not remove when the target is not a member of the room', async () => {
    const room = await makeRoom()
    await addMember(room.id, 'owner-1', 'owner')

    const result = await sut.execute({
      conversationId: room.id.toString(),
      actorId: 'owner-1',
      targetUserId: 'ghost-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
