import { describe, expect, it } from 'vitest'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { FriendCreatedEvent } from '../events/friend-created-event'
import { makeFriendship } from 'test/factories/make-friendship'

describe('Friendship Entity', () => {
  it('should raise a FriendCreatedEvent when a new friendship is created', () => {
    const friendship = makeFriendship()

    expect(friendship.domainEvents).toHaveLength(1)
    expect(friendship.domainEvents[0]).toBeInstanceOf(FriendCreatedEvent)
  })

  it('should not raise a FriendCreatedEvent when hydrating an existing friendship', () => {
    const friendship = makeFriendship({}, new UniqueEntityId('friendship-1'))

    expect(friendship.domainEvents).toHaveLength(0)
  })
})
