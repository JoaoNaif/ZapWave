import { describe, expect, it } from 'vitest'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { makeMessage } from 'test/factories/make-message'
import { RedisMessageMapper } from './redis-message-mapper'

describe('Redis Message Mapper', () => {
  it('should read a plain entry (no type) as a new message keyed by the message id', () => {
    const message = makeMessage({}, new UniqueEntityId('msg-1'))

    const event = RedisMessageMapper.fieldsToEvent(
      RedisMessageMapper.toFields(message)
    )

    expect(event.type).toBe('message')
    expect(event.id).toBe('msg-1')
  })

  it('should round-trip an edited event with its own event id and editedAt', () => {
    const message = makeMessage({}, new UniqueEntityId('msg-1'))
    message.edit('texto novo')

    const fields = RedisMessageMapper.eventToFields({
      type: 'message-edited',
      id: 'evt-1',
      message,
    })
    const event = RedisMessageMapper.fieldsToEvent(fields)

    expect(event.type).toBe('message-edited')
    expect(event.id).toBe('evt-1')
    expect(RedisMessageMapper.eventIdOf(fields)).toBe('evt-1')

    if (event.type === 'message-edited') {
      expect(event.message.id.toString()).toBe('msg-1')
      expect(event.message.body).toBe('texto novo')
      expect(event.message.editedAt).toEqual(message.editedAt)
    }
  })

  it('should round-trip a deleted event', () => {
    const fields = RedisMessageMapper.eventToFields({
      type: 'message-deleted',
      id: 'evt-2',
      messageId: 'msg-1',
      conversationId: 'conversation-1',
    })

    expect(RedisMessageMapper.fieldsToEvent(fields)).toEqual({
      type: 'message-deleted',
      id: 'evt-2',
      messageId: 'msg-1',
      conversationId: 'conversation-1',
    })
    expect(RedisMessageMapper.eventIdOf(fields)).toBe('evt-2')
  })

  it('should keep a reply preview through the stream', () => {
    const message = makeMessage({
      replyToId: new UniqueEntityId('msg-0'),
      replyTo: { id: 'msg-0', senderId: 'user-2', body: 'original' },
    })

    const event = RedisMessageMapper.fieldsToEvent(
      RedisMessageMapper.toFields(message)
    )

    if (event.type === 'message') {
      expect(event.message.replyTo).toEqual({
        id: 'msg-0',
        senderId: 'user-2',
        body: 'original',
      })
    }
  })
})
