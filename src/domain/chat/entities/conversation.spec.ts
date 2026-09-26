import { describe, expect, it } from 'vitest'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { Conversation } from './conversation'

describe('Conversation', () => {
  it('should give the same dm key no matter who opens the conversation', () => {
    expect(Conversation.dmKeyFor('user-1', 'friend-1')).toBe(
      Conversation.dmKeyFor('friend-1', 'user-1')
    )
  })

  it('should give different dm keys to different pairs', () => {
    expect(Conversation.dmKeyFor('user-1', 'friend-1')).not.toBe(
      Conversation.dmKeyFor('user-1', 'friend-2')
    )
  })

  it('should have no dm key unless one is given', () => {
    const room = Conversation.create({
      type: 'room',
      name: 'team',
      createdById: new UniqueEntityId('user-1'),
    })

    expect(room.dmKey).toBeNull()
  })
})
