import { beforeEach, describe, expect, it } from 'vitest'
import { MarkConversationReadUseCase } from './mark-conversation-read'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository

let sut: MarkConversationReadUseCase

describe('Mark Conversation Read', () => {
  beforeEach(() => {
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()

    sut = new MarkConversationReadUseCase(inMemoryConversationMemberRepository)
  })

  it('should mark the first message as read when there is no cursor yet', async () => {
    const member = makeConversationMember({
      userId: new UniqueEntityId('user-1'),
      conversationId: new UniqueEntityId('conversation-1'),
      lastReadMessageId: null,
    })
    await inMemoryConversationMemberRepository.create(member)

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
      messageId: 'msg-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.read).toBe(true)
    }
    expect(member.lastReadMessageId?.toString()).toBe('msg-1')
  })

  it('should advance the cursor when the message read is newer', async () => {
    const member = makeConversationMember({
      userId: new UniqueEntityId('user-1'),
      conversationId: new UniqueEntityId('conversation-1'),
      lastReadMessageId: new UniqueEntityId('msg-1'),
    })
    await inMemoryConversationMemberRepository.create(member)

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
      messageId: 'msg-2',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.read).toBe(true)
    }
    expect(member.lastReadMessageId?.toString()).toBe('msg-2')
  })

  it('should not regress the cursor when an older message arrives out of order', async () => {
    const member = makeConversationMember({
      userId: new UniqueEntityId('user-1'),
      conversationId: new UniqueEntityId('conversation-1'),
      lastReadMessageId: new UniqueEntityId('msg-3'),
    })
    await inMemoryConversationMemberRepository.create(member)

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
      messageId: 'msg-2',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.read).toBe(false)
    }
    // cursor continua no mais recente, não regrediu
    expect(member.lastReadMessageId?.toString()).toBe('msg-3')
  })

  it('should mark as read again when the same message is read twice', async () => {
    const member = makeConversationMember({
      userId: new UniqueEntityId('user-1'),
      conversationId: new UniqueEntityId('conversation-1'),
      lastReadMessageId: new UniqueEntityId('msg-1'),
    })
    await inMemoryConversationMemberRepository.create(member)

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
      messageId: 'msg-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.read).toBe(true)
    }
  })

  it('should return the same error for a non-member as for a non-existent conversation', async () => {
    const result = await sut.execute({
      userId: 'intruder',
      conversationId: 'conversation-1',
      messageId: 'msg-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
