import { beforeEach, describe, expect, it } from 'vitest'
import { FetchRoomMembersUseCase } from './fetch-room-members'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { makeConversation } from 'test/factories/make-conversation'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { makeUser } from 'test/factories/make-user'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository
let inMemoryUserRepository: InMemoryUserRepository

let sut: FetchRoomMembersUseCase

describe('Fetch Room Members', () => {
  beforeEach(() => {
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryUserRepository = new InMemoryUserRepository()

    sut = new FetchRoomMembersUseCase(
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository,
      inMemoryUserRepository
    )
  })

  async function addMember(
    roomId: string,
    userId: string,
    displayName: string,
    role: 'owner' | 'admin' | 'member'
  ) {
    await inMemoryUserRepository.create(
      makeUser({ displayName }, new UniqueEntityId(userId))
    )
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: new UniqueEntityId(roomId),
        userId: new UniqueEntityId(userId),
        role,
      })
    )
  }

  it('should be able to fetch the members of a room, owner and admins first', async () => {
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )
    await addMember('room-1', 'user-1', 'Zeca', 'member')
    await addMember('room-1', 'user-2', 'Bruno', 'member')
    await addMember('room-1', 'user-3', 'Carla', 'owner')
    await addMember('room-1', 'user-4', 'Daniel', 'admin')

    const result = await sut.execute({ userId: 'user-1', roomId: 'room-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(
        result.value.members.map((member) => [member.id, member.role])
      ).toEqual([
        ['user-3', 'owner'],
        ['user-4', 'admin'],
        ['user-2', 'member'],
        ['user-1', 'member'],
      ])
    }
  })

  it('should not be able to fetch members when the user is not a member', async () => {
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )
    await addMember('room-1', 'owner-1', 'Ana', 'owner')

    const result = await sut.execute({ userId: 'outsider', roomId: 'room-1' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to fetch members of a room that does not exist', async () => {
    const result = await sut.execute({ userId: 'user-1', roomId: 'ghost' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to fetch members of a direct conversation', async () => {
    await inMemoryConversationRepository.create(
      makeConversation({ type: 'dm' }, new UniqueEntityId('dm-1'))
    )
    await addMember('dm-1', 'user-1', 'Ana', 'member')

    const result = await sut.execute({ userId: 'user-1', roomId: 'dm-1' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should never expose private fields of the members', async () => {
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )
    await addMember('room-1', 'user-1', 'Ana', 'owner')

    const result = await sut.execute({ userId: 'user-1', roomId: 'room-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(Object.keys(result.value.members[0]).sort()).toEqual([
        'displayName',
        'id',
        'role',
        'username',
      ])
    }
  })
})
