import { beforeEach, describe, expect, it } from 'vitest'
import { LeaveRoomUseCase } from './leave-room'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { makeConversation } from 'test/factories/make-conversation'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository

let sut: LeaveRoomUseCase

describe('Leave Room', () => {
  beforeEach(() => {
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()

    sut = new LeaveRoomUseCase(
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

  it('should let a member leave the room', async () => {
    const room = await makeRoom()

    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: room.id,
        userId: new UniqueEntityId('member-1'),
        role: 'member',
      })
    )

    const result = await sut.execute({
      conversationId: room.id.toString(),
      userId: 'member-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(0)
  })

  it('should let an admin leave the room', async () => {
    const room = await makeRoom()

    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: room.id,
        userId: new UniqueEntityId('admin-1'),
        role: 'admin',
      })
    )

    const result = await sut.execute({
      conversationId: room.id.toString(),
      userId: 'admin-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(0)
  })

  it('should only remove the leaving member', async () => {
    const room = await makeRoom()

    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: room.id,
        userId: new UniqueEntityId('member-1'),
        role: 'member',
      })
    )
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: room.id,
        userId: new UniqueEntityId('member-2'),
        role: 'member',
      })
    )

    await sut.execute({
      conversationId: room.id.toString(),
      userId: 'member-1',
    })

    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)
    expect(
      inMemoryConversationMemberRepository.items[0].userId.toString()
    ).toBe('member-2')
  })

  it('should not let the owner leave the room', async () => {
    const room = await makeRoom()

    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: room.id,
        userId: new UniqueEntityId('owner-1'),
        role: 'owner',
      })
    )

    const result = await sut.execute({
      conversationId: room.id.toString(),
      userId: 'owner-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(1)
  })

  it('should not leave a conversation that does not exist', async () => {
    const result = await sut.execute({
      conversationId: 'non-existing-room',
      userId: 'member-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not leave a conversation that is not a room', async () => {
    const dm = makeConversation(
      { type: 'dm', name: null },
      new UniqueEntityId('dm-1')
    )
    await inMemoryConversationRepository.create(dm)

    const result = await sut.execute({
      conversationId: dm.id.toString(),
      userId: 'member-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not leave a room the user is not a member of', async () => {
    const room = await makeRoom()

    const result = await sut.execute({
      conversationId: room.id.toString(),
      userId: 'stranger-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
