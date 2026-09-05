import { beforeEach, describe, expect, it } from 'vitest'
import { OpenDirectConversationUseCase } from './open-direct-conversation'
import { InMemoryFriendshipRepository } from 'test/repositories/in-memory-friendship-repository'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { makeFriendship } from 'test/factories/make-friendship'
import { makeConversation } from 'test/factories/make-conversation'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { FriendshipNotAcceptedError } from '../errors/friendship-not-accepted-error'

let inMemoryFriendshipRepository: InMemoryFriendshipRepository
let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository

let sut: OpenDirectConversationUseCase

describe('Open Direct Conversation', () => {
  beforeEach(() => {
    inMemoryFriendshipRepository = new InMemoryFriendshipRepository()
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()

    sut = new OpenDirectConversationUseCase(
      inMemoryFriendshipRepository,
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository
    )
  })

  it('should be able to create a new dm conversation between accepted friends', async () => {
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )

    const result = await sut.execute({
      userId: 'user-1',
      friendId: 'friend-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryConversationRepository.items).toHaveLength(1)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(2)

    if (result.isRight()) {
      expect(result.value.conversation.type).toBe('dm')
      expect(result.value.isNewConversation).toBe(true)
      expect(result.value.member.userId.toString()).toBe('user-1')
    }
  })

  it('should find the friendship regardless of who sent the request', async () => {
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'friend-1',
        recipientId: 'user-1',
        status: 'accepted',
      })
    )

    const result = await sut.execute({
      userId: 'user-1',
      friendId: 'friend-1',
    })

    expect(result.isRight()).toBe(true)
  })

  it('should return the existing dm conversation instead of creating a new one', async () => {
    const conversation = makeConversation(
      { type: 'dm' },
      new UniqueEntityId('conversation-1')
    )
    await inMemoryConversationRepository.create(conversation)

    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: conversation.id,
        userId: new UniqueEntityId('user-1'),
      })
    )
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: conversation.id,
        userId: new UniqueEntityId('friend-1'),
      })
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )

    const result = await sut.execute({
      userId: 'user-1',
      friendId: 'friend-1',
    })

    expect(result.isRight()).toBe(true)
    // não deve criar conversa/membros novos
    expect(inMemoryConversationRepository.items).toHaveLength(1)
    expect(inMemoryConversationMemberRepository.items).toHaveLength(2)

    if (result.isRight()) {
      expect(result.value.conversation.id.toString()).toBe('conversation-1')
      expect(result.value.isNewConversation).toBe(false)
    }
  })

  it('should not confuse a shared room with the dm conversation', async () => {
    const room = makeConversation(
      { type: 'room', name: 'team' },
      new UniqueEntityId('room-1')
    )
    const dm = makeConversation({ type: 'dm' }, new UniqueEntityId('dm-1'))
    await inMemoryConversationRepository.create(room)
    await inMemoryConversationRepository.create(dm)

    // ambos são membros da sala E da dm — a sala vem primeiro na lista
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: room.id,
        userId: new UniqueEntityId('user-1'),
      })
    )
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: room.id,
        userId: new UniqueEntityId('friend-1'),
      })
    )
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: dm.id,
        userId: new UniqueEntityId('user-1'),
      })
    )
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: dm.id,
        userId: new UniqueEntityId('friend-1'),
      })
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )

    const result = await sut.execute({
      userId: 'user-1',
      friendId: 'friend-1',
    })

    expect(result.isRight()).toBe(true)
    // não deve criar uma dm nova, e tem que devolver a dm, não a sala
    expect(inMemoryConversationRepository.items).toHaveLength(2)

    if (result.isRight()) {
      expect(result.value.conversation.id.toString()).toBe('dm-1')
      expect(result.value.conversation.type).toBe('dm')
    }
  })

  it('should not open a conversation when there is no friendship between the users', async () => {
    const result = await sut.execute({
      userId: 'user-1',
      friendId: 'friend-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not open a conversation when the friendship is not accepted', async () => {
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'pending',
      })
    )

    const result = await sut.execute({
      userId: 'user-1',
      friendId: 'friend-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(FriendshipNotAcceptedError)
  })

  it('should not allow a user to open a conversation with themselves', async () => {
    const result = await sut.execute({
      userId: 'user-1',
      friendId: 'user-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
  })
})
