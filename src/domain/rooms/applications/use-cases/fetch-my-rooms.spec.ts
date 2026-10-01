import { beforeEach, describe, expect, it } from 'vitest'
import { FetchMyRoomsUseCase } from './fetch-my-rooms'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { InMemoryMessageRepository } from 'test/repositories/in-memory-message-repository'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { makeUser } from 'test/factories/make-user'
import { makeMessage } from 'test/factories/make-message'
import { makeConversation } from 'test/factories/make-conversation'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'

let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository
let inMemoryMessageRepository: InMemoryMessageRepository
let inMemoryUserRepository: InMemoryUserRepository

let sut: FetchMyRoomsUseCase

describe('Fetch My Rooms', () => {
  beforeEach(() => {
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryMessageRepository = new InMemoryMessageRepository()
    inMemoryUserRepository = new InMemoryUserRepository()

    sut = new FetchMyRoomsUseCase(
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository,
      inMemoryMessageRepository,
      inMemoryUserRepository
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
          lastMessage: null,
          unreadCount: 0,
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

  describe('unread count', () => {
    // ids ordenáveis como ULID: comparação de string = ordem de criação
    async function addMessage(
      id: string,
      senderId: string,
      createdAt = new Date('2026-09-10T10:00:00Z')
    ) {
      await inMemoryMessageRepository.create(
        makeMessage(
          {
            conversationId: new UniqueEntityId('room-1'),
            senderId: new UniqueEntityId(senderId),
            createdAt,
          },
          new UniqueEntityId(id)
        )
      )
    }

    beforeEach(async () => {
      await inMemoryConversationRepository.create(
        makeConversation(
          { type: 'room', name: 'g' },
          new UniqueEntityId('room-1')
        )
      )
    })

    it('should count only messages from others after the last read one', async () => {
      await inMemoryConversationMemberRepository.create(
        makeConversationMember({
          conversationId: new UniqueEntityId('room-1'),
          userId: new UniqueEntityId('user-1'),
          lastReadMessageId: new UniqueEntityId('msg-02'),
        })
      )
      await addMessage('msg-01', 'user-2')
      await addMessage('msg-02', 'user-2')
      await addMessage('msg-03', 'user-2')
      await addMessage('msg-04', 'user-1') // minha: não conta
      await addMessage('msg-05', 'user-3')

      const result = await sut.execute({ userId: 'user-1' })

      expect(result.isRight()).toBe(true)
      if (result.isRight()) {
        expect(result.value.rooms[0].unreadCount).toBe(2)
      }
    })

    it('should ignore messages sent before joining when nothing was read yet', async () => {
      await inMemoryConversationMemberRepository.create(
        makeConversationMember({
          conversationId: new UniqueEntityId('room-1'),
          userId: new UniqueEntityId('user-1'),
          joinedAt: new Date('2026-09-10T10:00:00Z'),
          lastReadMessageId: null,
        })
      )
      await addMessage('msg-01', 'user-2', new Date('2026-09-09T10:00:00Z'))
      await addMessage('msg-02', 'user-2', new Date('2026-09-11T10:00:00Z'))

      const result = await sut.execute({ userId: 'user-1' })

      expect(result.isRight()).toBe(true)
      if (result.isRight()) {
        expect(result.value.rooms[0].unreadCount).toBe(1)
      }
    })
  })

  it('should bring a preview of the last message with the sender name', async () => {
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'room', name: 'g' },
        new UniqueEntityId('room-1')
      )
    )
    await addMember('room-1', 'user-1')
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Bruno' }, new UniqueEntityId('user-2'))
    )

    for (const [id, body] of [
      ['msg-01', 'primeira'],
      ['msg-02', 'x'.repeat(150)],
    ]) {
      await inMemoryMessageRepository.create(
        makeMessage(
          {
            conversationId: new UniqueEntityId('room-1'),
            senderId: new UniqueEntityId('user-2'),
            body,
          },
          new UniqueEntityId(id)
        )
      )
    }

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.rooms[0].lastMessage).toEqual({
        id: 'msg-02',
        senderId: 'user-2',
        senderDisplayName: 'Bruno',
        // cortada em 100 + reticências
        body: 'x'.repeat(100) + '…',
        createdAt: expect.any(Date),
      })
    }
  })
})
