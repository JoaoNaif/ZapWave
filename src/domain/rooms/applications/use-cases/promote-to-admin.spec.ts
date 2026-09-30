import { beforeEach, describe, expect, it } from 'vitest'
import { PromoteToAdminUseCase } from './promote-to-admin'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { makeConversation } from 'test/factories/make-conversation'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository

let sut: PromoteToAdminUseCase

describe('Promote To Admin', () => {
  beforeEach(async () => {
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()

    sut = new PromoteToAdminUseCase(
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository
    )

    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )
    await addMember('owner-1', 'owner')
    await addMember('admin-1', 'admin')
    await addMember('member-1', 'member')
  })

  async function addMember(
    userId: string,
    role: 'owner' | 'admin' | 'member',
    roomId = 'room-1'
  ) {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: new UniqueEntityId(roomId),
        userId: new UniqueEntityId(userId),
        role,
      })
    )
  }

  function roleOf(userId: string) {
    return inMemoryConversationMemberRepository.items.find(
      (item) => item.userId.toString() === userId
    )?.role
  }

  it('should be able to promote a member to admin', async () => {
    const result = await sut.execute({
      conversationId: 'room-1',
      actorId: 'owner-1',
      targetUserId: 'member-1',
    })

    expect(result.isRight()).toBe(true)
    expect(roleOf('member-1')).toBe('admin')
  })

  it('should succeed without changes when the target is already admin', async () => {
    const result = await sut.execute({
      conversationId: 'room-1',
      actorId: 'owner-1',
      targetUserId: 'admin-1',
    })

    expect(result.isRight()).toBe(true)
    expect(roleOf('admin-1')).toBe('admin')
  })

  it('should not be able to promote when the actor is an admin', async () => {
    const result = await sut.execute({
      conversationId: 'room-1',
      actorId: 'admin-1',
      targetUserId: 'member-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(roleOf('member-1')).toBe('member')
  })

  it('should not be able to promote when the actor is a member', async () => {
    await addMember('member-2', 'member')

    const result = await sut.execute({
      conversationId: 'room-1',
      actorId: 'member-1',
      targetUserId: 'member-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
  })

  it('should not be able to change the role of the owner', async () => {
    const result = await sut.execute({
      conversationId: 'room-1',
      actorId: 'owner-1',
      targetUserId: 'owner-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(roleOf('owner-1')).toBe('owner')
  })

  it('should not be able to promote someone who is not a member', async () => {
    const result = await sut.execute({
      conversationId: 'room-1',
      actorId: 'owner-1',
      targetUserId: 'outsider',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to promote when the actor is not a member', async () => {
    const result = await sut.execute({
      conversationId: 'room-1',
      actorId: 'outsider',
      targetUserId: 'member-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to promote in a direct conversation', async () => {
    await inMemoryConversationRepository.create(
      makeConversation({ type: 'dm' }, new UniqueEntityId('dm-1'))
    )
    await addMember('dm-user-1', 'owner', 'dm-1')
    await addMember('dm-user-2', 'member', 'dm-1')

    const result = await sut.execute({
      conversationId: 'dm-1',
      actorId: 'dm-user-1',
      targetUserId: 'dm-user-2',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to promote in a room that does not exist', async () => {
    const result = await sut.execute({
      conversationId: 'ghost',
      actorId: 'owner-1',
      targetUserId: 'member-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
