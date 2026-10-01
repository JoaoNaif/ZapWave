import { beforeEach, describe, expect, it } from 'vitest'
import { FetchConversationReadsUseCase } from './fetch-conversation-reads'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository

let sut: FetchConversationReadsUseCase

describe('Fetch Conversation Reads', () => {
  beforeEach(() => {
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()

    sut = new FetchConversationReadsUseCase(
      inMemoryConversationMemberRepository
    )
  })

  async function addMember(userId: string, lastReadMessageId: string | null) {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        conversationId: new UniqueEntityId('conversation-1'),
        userId: new UniqueEntityId(userId),
        lastReadMessageId: lastReadMessageId
          ? new UniqueEntityId(lastReadMessageId)
          : null,
      })
    )
  }

  it('should be able to fetch the read cursors of the other members', async () => {
    await addMember('user-1', 'msg-03')
    await addMember('user-2', 'msg-02')
    await addMember('user-3', null)

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.reads).toEqual([
        { userId: 'user-2', lastReadMessageId: 'msg-02' },
        { userId: 'user-3', lastReadMessageId: null },
      ])
    }
  })

  it('should not be able to fetch reads of a conversation the user is not in', async () => {
    await addMember('user-2', 'msg-02')

    const result = await sut.execute({
      userId: 'user-1',
      conversationId: 'conversation-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
