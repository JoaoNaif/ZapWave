import { describe, expect, it } from 'vitest'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { makeMessage } from 'test/factories/make-message'

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/

describe('Message Entity', () => {
  it('should generate a ulid as the id when creating a new message', () => {
    const message = makeMessage()

    expect(message.id.toString()).toMatch(ULID_REGEX)
  })

  it('should not overwrite the id when hydrating an existing message', () => {
    const message = makeMessage({}, new UniqueEntityId('message-1'))

    expect(message.id.toString()).toBe('message-1')
  })

  it('should generate ids that sort chronologically by creation order', async () => {
    const first = makeMessage()
    await new Promise((resolve) => setTimeout(resolve, 2))
    const second = makeMessage()

    expect(first.id.toString() < second.id.toString()).toBe(true)
  })
})
