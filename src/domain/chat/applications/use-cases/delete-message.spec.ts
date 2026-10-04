import { beforeEach, describe, expect, it } from 'vitest'
import { DeleteMessageUseCase } from './delete-message'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { InMemoryMessageRepository } from 'test/repositories/in-memory-message-repository'
import { InMemoryMessageStream } from 'test/gateways/in-memory-message-stream'
import { InMemoryDevicesRepository } from 'test/repositories/in-memory-devices-repository'
import { makeDevice } from 'test/factories/make-device'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { makeMessage } from 'test/factories/make-message'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository
let inMemoryMessageRepository: InMemoryMessageRepository
let inMemoryMessageStream: InMemoryMessageStream
let inMemoryDevicesRepository: InMemoryDevicesRepository

let sut: DeleteMessageUseCase

describe('Delete Message', () => {
  beforeEach(async () => {
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryMessageRepository = new InMemoryMessageRepository()
    inMemoryMessageStream = new InMemoryMessageStream()
    inMemoryDevicesRepository = new InMemoryDevicesRepository()

    sut = new DeleteMessageUseCase(
      inMemoryConversationMemberRepository,
      inMemoryMessageRepository,
      inMemoryMessageStream,
      inMemoryDevicesRepository
    )

    for (const userId of ['user-1', 'user-2']) {
      await inMemoryConversationMemberRepository.create(
        makeConversationMember({
          userId: new UniqueEntityId(userId),
          conversationId: new UniqueEntityId('conversation-1'),
        })
      )
    }

    await inMemoryMessageRepository.create(
      makeMessage(
        {
          conversationId: new UniqueEntityId('conversation-1'),
          senderId: new UniqueEntityId('user-1'),
        },
        new UniqueEntityId('message-1')
      )
    )
  })

  it('should be able to delete own message', async () => {
    const result = await sut.execute({
      userId: 'user-1',
      messageId: 'message-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryMessageRepository.items).toHaveLength(0)

    if (result.isRight()) {
      expect(result.value.conversationId).toBe('conversation-1')
    }
  })

  it('should not be able to delete a message from another user', async () => {
    const result = await sut.execute({
      userId: 'user-2',
      messageId: 'message-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryMessageRepository.items).toHaveLength(1)
  })

  it('should publish a deleted event to every active device of the members', async () => {
    for (const [id, userId] of [
      ['device-1a', 'user-1'],
      ['device-2a', 'user-2'],
    ]) {
      await inMemoryDevicesRepository.create(
        makeDevice(
          { userId: new UniqueEntityId(userId) },
          new UniqueEntityId(id)
        )
      )
    }

    await sut.execute({ userId: 'user-1', messageId: 'message-1' })

    expect(inMemoryMessageStream.publishedEvents).toHaveLength(1)

    const [{ event, recipientDeviceIds }] = inMemoryMessageStream.publishedEvents

    expect(recipientDeviceIds.sort()).toEqual(['device-1a', 'device-2a'])
    expect(event).toEqual({
      type: 'message-deleted',
      id: expect.any(String),
      messageId: 'message-1',
      conversationId: 'conversation-1',
    })
  })

  it('should not publish anything when the delete is not allowed', async () => {
    await sut.execute({ userId: 'user-2', messageId: 'message-1' })

    expect(inMemoryMessageStream.publishedEvents).toHaveLength(0)
  })

  it('should move the read cursor back to the previous message of whoever had read up to the deleted one', async () => {
    await inMemoryMessageRepository.create(
      makeMessage(
        {
          conversationId: new UniqueEntityId('conversation-1'),
          senderId: new UniqueEntityId('user-1'),
        },
        new UniqueEntityId('message-0')
      )
    )

    const reader = inMemoryConversationMemberRepository.items.find(
      (item) => item.userId.toString() === 'user-2'
    )!
    reader.lastReadMessageId = new UniqueEntityId('message-1')

    await sut.execute({ userId: 'user-1', messageId: 'message-1' })

    expect(reader.lastReadMessageId?.toString()).toBe('message-0')
  })

  it('should clear the read cursor when there is no previous message', async () => {
    const reader = inMemoryConversationMemberRepository.items.find(
      (item) => item.userId.toString() === 'user-2'
    )!
    reader.lastReadMessageId = new UniqueEntityId('message-1')

    await sut.execute({ userId: 'user-1', messageId: 'message-1' })

    expect(reader.lastReadMessageId).toBeNull()
  })

  it('should not touch the read cursor of members who read other messages', async () => {
    const reader = inMemoryConversationMemberRepository.items.find(
      (item) => item.userId.toString() === 'user-2'
    )!
    reader.lastReadMessageId = new UniqueEntityId('message-9')

    await sut.execute({ userId: 'user-1', messageId: 'message-1' })

    expect(reader.lastReadMessageId?.toString()).toBe('message-9')
  })

  it('should not be able to delete a message that does not exist', async () => {
    const result = await sut.execute({
      userId: 'user-1',
      messageId: 'ghost-message',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should return the same error for a non-member as for a message that does not exist', async () => {
    const result = await sut.execute({
      userId: 'intruder',
      messageId: 'message-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
    expect(inMemoryMessageRepository.items).toHaveLength(1)
  })
})
