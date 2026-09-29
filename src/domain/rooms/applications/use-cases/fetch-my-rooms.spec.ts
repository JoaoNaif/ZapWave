import { beforeEach, describe, expect, it } from 'vitest'
import { FetchMyRoomsUseCase } from './fetch-my-rooms'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { makeConversation } from 'test/factories/make-conversation'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'

let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository

let sut: FetchMyRoomsUseCase

describe('Fetch My Rooms', () => {
  beforeEach(() => {
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()

    sut = new FetchMyRoomsUseCase(
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository
    )
  })

  async function addMember(
    roomId: string,
    userId: string,
    role: 'owner' | 'admin' | 'member' = 'member'
  ) {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: new UniqueEntityId(roomId),
        userId: new UniqueEntityId(userId),
        role,
      })
    )
  }

  it('should be able to fetch the rooms the user is a member of', async () => {
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'team-zapwave' },
        new UniqueEntityId('room-1')
      )
    )
    await addMember('room-1', 'user-1', 'owner')
    await addMember('room-1', 'user-2')
    await addMember('room-1', 'user-3')

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.rooms).toEqual([
        {
          id: 'room-1',
          name: 'team-zapwave',
          role: 'owner',
          memberCount: 3,
          lastMessageAt: null,
        },
      ])
    }
  })

  it('should return the role of the requesting user, not of the owner', async () => {
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )
    await addMember('room-1', 'owner-1', 'owner')
    await addMember('room-1', 'user-1', 'member')

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.rooms[0].role).toBe('member')
    }
  })

  it('should not list direct conversations', async () => {
    await inMemoryConversationRepository.create(
      makeConversation({ type: 'dm' }, new UniqueEntityId('dm-1'))
    )
    await addMember('dm-1', 'user-1')

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.rooms).toEqual([])
    }
  })

  it('should not list rooms the user is not a member of', async () => {
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )
    await addMember('room-1', 'other-1', 'owner')

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.rooms).toEqual([])
    }
  })

  it('should order rooms by last activity, most recent first', async () => {
    // room-1: mensagem antiga; room-2: sem mensagem, mas criada depois;
    // room-3: mensagem mais recente de todas
    await inMemoryConversationRepository.create(
      makeConversation(
        {
          type: 'room',
          name: 'antiga',
          createdAt: new Date('2026-09-01T10:00:00Z'),
          lastMessageAt: new Date('2026-09-02T10:00:00Z'),
        },
        new UniqueEntityId('room-1')
      )
    )
    await inMemoryConversationRepository.create(
      makeConversation(
        {
          type: 'room',
          name: 'nova-vazia',
          createdAt: new Date('2026-09-03T10:00:00Z'),
        },
        new UniqueEntityId('room-2')
      )
    )
    await inMemoryConversationRepository.create(
      makeConversation(
        {
          type: 'room',
          name: 'ativa',
          createdAt: new Date('2026-09-01T10:00:00Z'),
          lastMessageAt: new Date('2026-09-04T10:00:00Z'),
        },
        new UniqueEntityId('room-3')
      )
    )
    await addMember('room-1', 'user-1')
    await addMember('room-2', 'user-1')
    await addMember('room-3', 'user-1')

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.rooms.map((room) => room.id)).toEqual([
        'room-3',
        'room-2',
        'room-1',
      ])
    }
  })
})
