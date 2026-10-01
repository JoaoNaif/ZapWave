import { beforeEach, describe, expect, it } from 'vitest'
import { FetchFriendsUseCase } from './fetch-friends'
import { InMemoryFriendshipRepository } from 'test/repositories/in-memory-friendship-repository'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { InMemoryConversationRepository } from 'test/repositories/in-memory-conversation-repository'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { InMemoryMessageRepository } from 'test/repositories/in-memory-message-repository'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { makeMessage } from 'test/factories/make-message'
import { FakePresence } from 'test/gateways/fake-presence'
import { makeConversation } from 'test/factories/make-conversation'
import { Conversation } from '@/domain/chat/entities/conversation'
import { makeUser } from 'test/factories/make-user'
import { makeFriendship } from 'test/factories/make-friendship'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'

let inMemoryFriendshipRepository: InMemoryFriendshipRepository
let inMemoryUserRepository: InMemoryUserRepository
let inMemoryConversationRepository: InMemoryConversationRepository
let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository
let inMemoryMessageRepository: InMemoryMessageRepository
let fakePresence: FakePresence

let sut: FetchFriendsUseCase

describe('Fetch Friends', () => {
  beforeEach(() => {
    inMemoryFriendshipRepository = new InMemoryFriendshipRepository()
    inMemoryUserRepository = new InMemoryUserRepository()
    inMemoryConversationRepository = new InMemoryConversationRepository()
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryMessageRepository = new InMemoryMessageRepository()
    fakePresence = new FakePresence()

    sut = new FetchFriendsUseCase(
      inMemoryFriendshipRepository,
      inMemoryUserRepository,
      inMemoryConversationRepository,
      inMemoryConversationMemberRepository,
      inMemoryMessageRepository,
      fakePresence
    )
  })

  it('should be able to fetch friends from sent and received friendships', async () => {
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Bruno' }, new UniqueEntityId('friend-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Ana' }, new UniqueEntityId('friend-2'))
    )

    // um pedido que o usuário enviou, outro que ele recebeu
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'friend-2',
        recipientId: 'user-1',
        status: 'accepted',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      // nenhum dos dois tem mensagem: ordem alfabética
      expect(result.value.friends.map((friend) => friend.id)).toEqual([
        'friend-2',
        'friend-1',
      ])
    }
  })

  it('should order friends by the last message exchanged, most recent first', async () => {
    for (const [id, displayName] of [
      ['friend-1', 'Ana'],
      ['friend-2', 'Bruno'],
      ['friend-3', 'Carla'],
      ['friend-4', 'Daniel'],
    ]) {
      await inMemoryUserRepository.create(
        makeUser({ displayName }, new UniqueEntityId(id))
      )
      await inMemoryFriendshipRepository.create(
        makeFriendship({
          senderId: 'user-1',
          recipientId: id,
          status: 'accepted',
        })
      )
    }

    // Carla: conversa mais recente; Ana: mais antiga; Bruno e Daniel nunca
    // trocaram mensagem (Daniel tem DM aberta, mas vazia)
    await inMemoryConversationRepository.create(
      makeConversation({
        dmKey: Conversation.dmKeyFor('user-1', 'friend-1'),
        lastMessageAt: new Date('2026-09-01T10:00:00Z'),
      })
    )
    await inMemoryConversationRepository.create(
      makeConversation({
        dmKey: Conversation.dmKeyFor('user-1', 'friend-3'),
        lastMessageAt: new Date('2026-09-02T10:00:00Z'),
      })
    )
    await inMemoryConversationRepository.create(
      makeConversation({
        dmKey: Conversation.dmKeyFor('user-1', 'friend-4'),
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friends.map((friend) => friend.id)).toEqual([
        'friend-3',
        'friend-1',
        // sem mensagem: no fim, em ordem alfabética
        'friend-2',
        'friend-4',
      ])
      expect(result.value.friends[0].lastMessageAt).toEqual(
        new Date('2026-09-02T10:00:00Z')
      )
      expect(result.value.friends[2].lastMessageAt).toBeNull()
    }
  })

  it('should not list pending or rejected friendships', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('friend-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('friend-2'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'pending',
      })
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'friend-2',
        recipientId: 'user-1',
        status: 'rejected',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friends).toEqual([])
    }
  })

  it('should not list friendships of other users', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('stranger-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'stranger-1',
        recipientId: 'stranger-2',
        status: 'accepted',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friends).toEqual([])
    }
  })

  it('should tell which friends are online', async () => {
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Ana' }, new UniqueEntityId('friend-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Bruno' }, new UniqueEntityId('friend-2'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-2',
        status: 'accepted',
      })
    )

    await fakePresence.heartbeat('friend-1')

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friends).toEqual([
        expect.objectContaining({ id: 'friend-1', online: true }),
        expect.objectContaining({ id: 'friend-2', online: false }),
      ])
    }
  })

  it('should never expose private fields', async () => {
    await inMemoryUserRepository.create(
      makeUser({}, new UniqueEntityId('friend-1'))
    )

    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(Object.keys(result.value.friends[0]).sort()).toEqual([
        'displayName',
        'id',
        'lastMessage',
        'lastMessageAt',
        'online',
        'unreadCount',
        'username',
      ])
    }
  })

  it('should count unread messages from each friend in the DM', async () => {
    for (const id of ['friend-1', 'friend-2']) {
      await inMemoryUserRepository.create(makeUser({}, new UniqueEntityId(id)))
      await inMemoryFriendshipRepository.create(
        makeFriendship({
          senderId: 'user-1',
          recipientId: id,
          status: 'accepted',
        })
      )
    }

    // só friend-1 tem DM; friend-2 nunca conversou
    await inMemoryConversationRepository.create(
      makeConversation(
        {
          type: 'dm',
          dmKey: Conversation.dmKeyFor('user-1', 'friend-1'),
          lastMessageAt: new Date('2026-09-10T10:00:00Z'),
        },
        new UniqueEntityId('dm-1')
      )
    )
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: new UniqueEntityId('dm-1'),
        userId: new UniqueEntityId('user-1'),
        lastReadMessageId: new UniqueEntityId('msg-01'),
      })
    )
    for (const [id, senderId] of [
      ['msg-01', 'friend-1'],
      ['msg-02', 'friend-1'],
      ['msg-03', 'user-1'],
      ['msg-04', 'friend-1'],
    ]) {
      await inMemoryMessageRepository.create(
        makeMessage(
          {
            conversationId: new UniqueEntityId('dm-1'),
            senderId: new UniqueEntityId(senderId),
          },
          new UniqueEntityId(id)
        )
      )
    }

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.friends).toEqual([
        expect.objectContaining({ id: 'friend-1', unreadCount: 2 }),
        expect.objectContaining({ id: 'friend-2', unreadCount: 0 }),
      ])
    }
  })

  it('should bring a preview of the last message of the DM, even if it is mine', async () => {
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Eu' }, new UniqueEntityId('user-1'))
    )
    await inMemoryUserRepository.create(
      makeUser({ displayName: 'Ana' }, new UniqueEntityId('friend-1'))
    )
    await inMemoryFriendshipRepository.create(
      makeFriendship({
        senderId: 'user-1',
        recipientId: 'friend-1',
        status: 'accepted',
      })
    )
    await inMemoryConversationRepository.create(
      makeConversation(
        { type: 'dm', dmKey: Conversation.dmKeyFor('user-1', 'friend-1') },
        new UniqueEntityId('dm-1')
      )
    )
    await inMemoryMessageRepository.create(
      makeMessage(
        {
          conversationId: new UniqueEntityId('dm-1'),
          senderId: new UniqueEntityId('friend-1'),
          body: 'oi',
        },
        new UniqueEntityId('msg-01')
      )
    )
    await inMemoryMessageRepository.create(
      makeMessage(
        {
          conversationId: new UniqueEntityId('dm-1'),
          senderId: new UniqueEntityId('user-1'),
          body: 'tudo bem?',
        },
        new UniqueEntityId('msg-02')
      )
    )

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      // eu não apareço como amigo de mim mesmo
      expect(result.value.friends).toHaveLength(1)
      expect(result.value.friends[0].lastMessage).toEqual({
        id: 'msg-02',
        senderId: 'user-1',
        senderDisplayName: 'Eu',
        body: 'tudo bem?',
        createdAt: expect.any(Date),
      })
    }
  })
})
