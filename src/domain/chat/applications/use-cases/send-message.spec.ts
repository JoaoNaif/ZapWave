import { beforeEach, describe, expect, it } from 'vitest'
import { SendMessageUseCase } from './send-message'
import { InMemoryConversationMemberRepository } from 'test/repositories/in-memory-conversation-member-repository'
import { InMemoryMessageRepository } from 'test/repositories/in-memory-message-repository'
import { InMemoryMessageStream } from 'test/gateways/in-memory-message-stream'
import { InMemoryDevicesRepository } from 'test/repositories/in-memory-devices-repository'
import { makeConversationMember } from 'test/factories/make-conversation-member'
import { makeDevice } from 'test/factories/make-device'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryConversationMemberRepository: InMemoryConversationMemberRepository
let inMemoryMessageRepository: InMemoryMessageRepository
let inMemoryMessageStream: InMemoryMessageStream
let inMemoryDevicesRepository: InMemoryDevicesRepository

let sut: SendMessageUseCase

describe('Send Message', () => {
  beforeEach(() => {
    inMemoryConversationMemberRepository =
      new InMemoryConversationMemberRepository()
    inMemoryMessageRepository = new InMemoryMessageRepository()
    inMemoryMessageStream = new InMemoryMessageStream()
    inMemoryDevicesRepository = new InMemoryDevicesRepository()

    sut = new SendMessageUseCase(
      inMemoryConversationMemberRepository,
      inMemoryMessageRepository,
      inMemoryMessageStream,
      inMemoryDevicesRepository
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
      expect(result.value.message.senderId).toBe('user-1')
      expect(result.value.message.conversationId).toBe('conversation-1')
      expect(inMemoryMessageRepository.items[0].id.toString()).toBe(
        result.value.message.id
      )
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
        inMemoryMessageRepository.items[0]
      )
      expect(inMemoryMessageStream.published[0].message.id.toString()).toBe(
        result.value.message.id
      )
    }
  })

  it('should publish to every active device of every member, including other devices of the sender', async () => {
    for (const userId of ['user-1', 'user-2']) {
      await inMemoryConversationMemberRepository.create(
        makeConversationMember({
          userId: new UniqueEntityId(userId),
          conversationId: new UniqueEntityId('conversation-1'),
        })
      )
    }

    const devices = [
      { id: 'device-1a', userId: 'user-1' },
      { id: 'device-1b', userId: 'user-1' },
      { id: 'device-2a', userId: 'user-2' },
    ]

    for (const { id, userId } of devices) {
      await inMemoryDevicesRepository.create(
        makeDevice(
          { userId: new UniqueEntityId(userId) },
          new UniqueEntityId(id)
        )
      )
    }

    await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
    })

    expect(
      inMemoryMessageStream.published[0].recipientDeviceIds.sort()
    ).toEqual(['device-1a', 'device-1b', 'device-2a'])
  })

  it('should not publish to revoked devices nor to devices of users outside the conversation', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    await inMemoryDevicesRepository.create(
      makeDevice(
        { userId: new UniqueEntityId('user-1') },
        new UniqueEntityId('device-active')
      )
    )
    await inMemoryDevicesRepository.create(
      makeDevice(
        { userId: new UniqueEntityId('user-1'), revokedAt: new Date() },
        new UniqueEntityId('device-revoked')
      )
    )
    await inMemoryDevicesRepository.create(
      makeDevice(
        { userId: new UniqueEntityId('outsider') },
        new UniqueEntityId('device-outsider')
      )
    )

    await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
    })

    expect(inMemoryMessageStream.published[0].recipientDeviceIds).toEqual([
      'device-active',
    ])
  })

  it('should deliver the message to the inbox of the recipient devices', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-2'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )
    await inMemoryDevicesRepository.create(
      makeDevice(
        { userId: new UniqueEntityId('user-2') },
        new UniqueEntityId('device-2a')
      )
    )

    const result = await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
    })

    const inbox: string[] = []
    for await (const message of inMemoryMessageStream.replayFrom(
      'device-2a',
      null
    )) {
      inbox.push(message.id.toString())
    }

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(inbox).toEqual([result.value.message.id])
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
      expect(result.value.message.clientMessageId).toBe('client-generated-id-1')
    }
  })

  it('should not duplicate the message when the same clientMessageId is sent again', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    const first = await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
      clientMessageId: 'client-generated-id-1',
    })

    const retry = await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
      clientMessageId: 'client-generated-id-1',
    })

    expect(first.isRight()).toBe(true)
    expect(retry.isRight()).toBe(true)
    expect(inMemoryMessageRepository.items).toHaveLength(1)
    // não republica no stream
    expect(inMemoryMessageStream.published).toHaveLength(1)

    if (first.isRight() && retry.isRight()) {
      expect(retry.value.message).toEqual(first.value.message)
    }
  })

  it('should not treat the same clientMessageId from another sender as a duplicate', async () => {
    for (const userId of ['user-1', 'user-2']) {
      await inMemoryConversationMemberRepository.create(
        makeConversationMember({
          userId: new UniqueEntityId(userId),
          conversationId: new UniqueEntityId('conversation-1'),
        })
      )
    }

    await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
      clientMessageId: 'client-generated-id-1',
    })

    const result = await sut.execute({
      senderId: 'user-2',
      conversationId: 'conversation-1',
      body: 'oi',
      clientMessageId: 'client-generated-id-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryMessageRepository.items).toHaveLength(2)
  })

  it('should always create a new message when there is no clientMessageId', async () => {
    await inMemoryConversationMemberRepository.create(
      makeConversationMember({
        userId: new UniqueEntityId('user-1'),
        conversationId: new UniqueEntityId('conversation-1'),
      })
    )

    await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
    })
    await sut.execute({
      senderId: 'user-1',
      conversationId: 'conversation-1',
      body: 'oi',
    })

    expect(inMemoryMessageRepository.items).toHaveLength(2)
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
