import { describe, expect, it } from 'vitest'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { makeMessage } from 'test/factories/make-message'
import { frameOf } from './enrich.transform'

describe('Enrich Transform frames', () => {
  it('should serialize a new message like before', () => {
    const message = makeMessage({}, new UniqueEntityId('msg-1'))

    const frame = JSON.parse(
      frameOf({ type: 'message', id: 'msg-1', message })
    )

    expect(frame.type).toBe('message')
    expect(frame.message.id).toBe('msg-1')
    expect(frame.eventId).toBeUndefined()
  })

  it('should serialize an edit with the event id and the full message', () => {
    const message = makeMessage({ body: 'antigo' }, new UniqueEntityId('msg-1'))
    message.edit('novo')

    const frame = JSON.parse(
      frameOf({ type: 'message-edited', id: 'evt-1', message })
    )

    expect(frame).toMatchObject({
      type: 'message-edited',
      eventId: 'evt-1',
      message: { id: 'msg-1', body: 'novo', editedAt: expect.any(String) },
    })
  })

  it('should serialize a removal with the event id, message id and conversation id', () => {
    const frame = JSON.parse(
      frameOf({
        type: 'message-deleted',
        id: 'evt-2',
        messageId: 'msg-1',
        conversationId: 'conversation-1',
      })
    )

    expect(frame).toEqual({
      type: 'message-deleted',
      eventId: 'evt-2',
      messageId: 'msg-1',
      conversationId: 'conversation-1',
    })
  })
})
