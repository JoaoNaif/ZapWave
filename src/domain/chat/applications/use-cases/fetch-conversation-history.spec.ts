import { beforeEach, describe, expect, it } from 'vitest'
import { FetchConversationHistoryUseCase } from './fetch-conversation-history'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { InMemoryMessageRepository } from 'test/repositories/in-memory-message-repository'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { makeMessage } from 'test/factories/make-message'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository
let inMemoryMessageRepository: InMemoryMessageRepository

let sut: FetchConversationHistoryUseCase

describe('Fetch Conversation History', () => {
  beforeEach(() => {
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryMessageRepository = new InMemoryMessageRepository()

    sut = new FetchConversationHistoryUseCase(
      inMemoryConversationMemberRepository,
      inMemoryMessageRepository
    )
  })

  it('should be able to fetch messages when the user is a member of the conversation', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    await inMemoryMessageRepository.create(
      makeMessage({
        conversationId: new UniqueEntityId('conversation-1'),
        body: 'oi',
      })
    )

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.messages).toHaveLength(1)
      expect(result.value.hasMore).toBe(false)
    }
  })

  it('should return the most recent messages first, limited by the page size', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    for (let i = 1; i <= 6; i++) {
      await inMemoryMessageRepository.create(
        makeMessage(
          { conversationId: new UniqueEntityId('conversation-1') },
          new UniqueEntityId(`msg-${i}`)
        )
      )
    }

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
      limit: 5,
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.messages).toHaveLength(5)
      expect(result.value.hasMore).toBe(true)
      // mais recente (msg-6) primeiro
      expect(result.value.messages.map((m) => m.id.toString())).toEqual([
        'msg-6',
        'msg-5',
        'msg-4',
        'msg-3',
        'msg-2',
      ])
    }
  })

  it('should return hasMore false when there are no more messages left', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    for (let i = 1; i <= 3; i++) {
      await inMemoryMessageRepository.create(
        makeMessage(
          { conversationId: new UniqueEntityId('conversation-1') },
          new UniqueEntityId(`msg-${i}`)
        )
      )
    }

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
      limit: 5,
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.messages).toHaveLength(3)
      expect(result.value.hasMore).toBe(false)
    }
  })

  it('should paginate using the before cursor', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    for (let i = 1; i <= 6; i++) {
      await inMemoryMessageRepository.create(
        makeMessage(
          { conversationId: new UniqueEntityId('conversation-1') },
          new UniqueEntityId(`msg-${i}`)
        )
      )
    }

    const firstPage = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
      limit: 5,
    })

    expect(firstPage.isRight()).toBe(true)
    if (!firstPage.isRight()) return

    const oldestOfFirstPage =
      firstPage.value.messages[firstPage.value.messages.length - 1]

    const secondPage = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
      limit: 5,
      before: oldestOfFirstPage.id.toString(),
    })

    expect(secondPage.isRight()).toBe(true)
    if (secondPage.isRight()) {
      expect(secondPage.value.messages).toHaveLength(1)
      expect(secondPage.value.messages[0].id.toString()).toBe('msg-1')
      expect(secondPage.value.hasMore).toBe(false)
    }
  })

  it('should not return messages from a different conversation', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    await inMemoryMessageRepository.create(
      makeMessage({ conversationId: new UniqueEntityId('conversation-1') })
    )
    await inMemoryMessageRepository.create(
      makeMessage({ conversationId: new UniqueEntityId('conversation-2') })
    )

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.messages).toHaveLength(1)
    }
  })

  it('should not be able to fetch history from a conversation that does not exist', async () => {
    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'ghost-conversation',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should return the same error for a non-member as for a non-existent conversation', async () => {
    // conversa existe de verdade (tem membro e mensagens), só que não
    // é o requisitante — não pode dar um erro diferente do caso "não existe",
    // senão revela pra qualquer um se o conversationId é válido
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('someone-else'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )
    await inMemoryMessageRepository.create(
      makeMessage({ conversationId: new UniqueEntityId('conversation-1') })
    )

    const result = await sut.execute({
      userId: 'intruder',
      conversationId: 'conversation-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
