import { beforeEach, describe, expect, it } from 'vitest'
import { CreateRoomUseCase } from './create-room'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'

let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository

let sut: CreateRoomUseCase

describe('Create Room', () => {
  beforeEach(() => {
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryConversationRepository = new InMemoryConversationRepository(
      inMemoryConversationMemberRepository
    )

    sut = new CreateRoomUseCase(inMemoryConversationRepository)
  })

  it('should be able to create a room', async () => {
    const result = await sut.execute({
      name: 'team-zapwave',
      userId: 'user-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryConversationRepository.items).toHaveLength(1)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)

    if (result.isRight()) {
      expect(result.value.room.type).toBe('room')
      expect(result.value.room.name).toBe('team-zapwave')
      expect(result.value.room.createdById).toBe('user-1')
    }
  })

  it('should persist the room with the id returned in the result', async () => {
    const result = await sut.execute({
      name: 'team-zapwave',
      userId: 'user-1',
    })

    if (result.isRight()) {
      expect(inMemoryConversationRepository.items[0].id.toString()).toBe(
        result.value.room.id
      )
    }
  })

  it('should add the creator as the owner member of the room', async () => {
    const result = await sut.execute({
      name: 'team-zapwave',
      userId: 'user-1',
    })

    const owner = inMemoryConversationMemberRepository.items[0]

    expect(owner.role).toBe('owner')
    expect(owner.userId.toString()).toBe('user-1')
    expect(owner.lastReadMessageId).toBeNull()

    if (result.isRight()) {
      expect(result.value.owner).toEqual({
        id: owner.id.toString(),
        roomId: result.value.room.id,
        userId: 'user-1',
        role: 'owner',
        joinedAt: owner.joinedAt,
        lastReadMessageId: null,
      })
    }
  })
})
