import { beforeEach, describe, expect, it } from 'vitest'
import { EditMessageUseCase } from './edit-message'
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

let sut: EditMessageUseCase

describe('Edit Message', () => {
  beforeEach(async () => {
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryMessageRepository = new InMemoryMessageRepository()
    inMemoryMessageStream = new InMemoryMessageStream()
    inMemoryDevicesRepository = new InMemoryDevicesRepository()

    sut = new EditMessageUseCase(
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
          body: 'texto original',
        },
        new UniqueEntityId('message-1')
      )
    )
  })

  it('should be able to edit own message', async () => {
    const result = await sut.execute({
      userId: 'user-1',
      messageId: 'message-1',
      body: 'texto novo',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryMessageRepository.items[0].body).toBe('texto novo')

    if (result.isRight()) {
      expect(result.value.message.body).toBe('texto novo')
      expect(result.value.message.editedAt).toBeInstanceOf(Date)
    }
  })

  it('should keep editedAt null on a message that was never edited', async () => {
    expect(inMemoryMessageRepository.items[0].editedAt).toBeNull()
  })

  it('should not change the message id nor its creation date', async () => {
    const { createdAt } = inMemoryMessageRepository.items[0]

    await sut.execute({
      userId: 'user-1',
      messageId: 'message-1',
      body: 'texto novo',
    })

    expect(inMemoryMessageRepository.items[0].id.toString()).toBe('message-1')
    expect(inMemoryMessageRepository.items[0].createdAt).toEqual(createdAt)
  })

  it('should not be able to edit a message from another user', async () => {
    const result = await sut.execute({
      userId: 'user-2',
      messageId: 'message-1',
      body: 'texto novo',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryMessageRepository.items[0].body).toBe('texto original')
    expect(inMemoryMessageRepository.items[0].editedAt).toBeNull()
  })

  it('should publish an edited event to every active device of the members', async () => {
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
    await inMemoryDevicesRepository.create(
      makeDevice(
        { userId: new UniqueEntityId('user-1'), revokedAt: new Date() },
        new UniqueEntityId('device-revoked')
      )
    )

    await sut.execute({
      userId: 'user-1',
      messageId: 'message-1',
      body: 'texto novo',
    })

    expect(inMemoryMessageStream.publishedEvents).toHaveLength(1)

    const [{ event, recipientDeviceIds }] = inMemoryMessageStream.publishedEvents

    expect(recipientDeviceIds.sort()).toEqual(['device-1a', 'device-2a'])
    expect(event.type).toBe('message-edited')
    // id próprio do evento, não o da mensagem
    expect(event.id).not.toBe('message-1')

    if (event.type === 'message-edited') {
      expect(event.message.body).toBe('texto novo')
      expect(event.message.editedAt).toBeInstanceOf(Date)
    }
  })

  it('should not publish anything when the edit is not allowed', async () => {
    await sut.execute({
      userId: 'user-2',
      messageId: 'message-1',
      body: 'texto novo',
    })

    expect(inMemoryMessageStream.publishedEvents).toHaveLength(0)
  })

  it('should keep the reply preview on the edited message', async () => {
    await inMemoryMessageRepository.create(
      makeMessage(
        {
          conversationId: new UniqueEntityId('conversation-1'),
          senderId: new UniqueEntityId('user-1'),
          replyToId: new UniqueEntityId('message-1'),
        },
        new UniqueEntityId('message-2')
      )
    )

    const result = await sut.execute({
      userId: 'user-1',
      messageId: 'message-2',
      body: 'resposta editada',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.message.replyTo).toEqual({
        id: 'message-1',
        senderId: 'user-1',
        body: 'texto original',
      })
    }
  })

  it('should not be able to edit a message that does not exist', async () => {
    const result = await sut.execute({
      userId: 'user-1',
      messageId: 'ghost-message',
      body: 'texto novo',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should return the same error for a non-member as for a message that does not exist', async () => {
    const result = await sut.execute({
      userId: 'intruder',
      messageId: 'message-1',
      body: 'texto novo',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
    expect(inMemoryMessageRepository.items[0].body).toBe('texto original')
  })
})
