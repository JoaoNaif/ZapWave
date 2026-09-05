import { beforeEach, describe, expect, it } from 'vitest'
import { SendMessageUseCase } from './send-message'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { InMemoryMessageRepository } from 'test/repositories/in-memory-message-repository'
import { InMemoryMessageStream } from 'test/gateways/in-memory-message-stream'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository
let inMemoryMessageRepository: InMemoryMessageRepository
let inMemoryMessageStream: InMemoryMessageStream

let sut: SendMessageUseCase

describe('Send Message', () => {
  beforeEach(() => {
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryMessageRepository = new InMemoryMessageRepository()
    inMemoryMessageStream = new InMemoryMessageStream()

    sut = new SendMessageUseCase(
      inMemoryConversationMemberRepository,
      inMemoryMessageRepository,
      inMemoryMessageStream
    )
  })

  it('should be able to send a message when the sender is a member of the conversation', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    const result = await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi, tudo bem?',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryMessageRepository.items).toHaveLength(1)

    if (result.isRight()) {
      expect(result.value.message.body).toBe('oi, tudo bem?')
      expect(result.value.message.senderId.toString()).toBe('user-1')
      expect(result.value.message.conversationId.toString()).toBe(
        'conversation-1'
      )
      expect(inMemoryMessageRepository.items[0]).toBe(result.value.message)
    }
  })

  it('should publish the message to the message stream after persisting it', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    const result = await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryMessageStream.published).toHaveLength(1)
    expect(inMemoryMessageStream.published[0].conversationId).toBe(
      'conversation-1'
    )

    if (result.isRight()) {
      expect(inMemoryMessageStream.published[0].message).toBe(
        result.value.message
      )
    }
  })

  it('should set clientMessageId to null when it is not provided', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    const result = await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.message.clientMessageId).toBeNull()
    }
  })

  it('should store the clientMessageId when provided', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    const result = await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
      clientMessageId: 'client-generated-id-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.message.clientMessageId?.toString()).toBe(
        'client-generated-id-1'
      )
    }
  })

  it('should not be able to send a message to a conversation the sender is not a member of', async () => {
    const result = await sut.execute({
      senderId: 'intruder',
      conversationId: 'conversation-1',
      body: 'oi',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
    expect(inMemoryMessageRepository.items).toHaveLength(0)
    expect(inMemoryMessageStream.published).toHaveLength(0)
  })

  it('should not be able to send a message to a conversation that does not exist', async () => {
    const result = await sut.execute({
      senderId: 'user-1',
      conversationId: 'ghost-conversation',
      body: 'oi',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
