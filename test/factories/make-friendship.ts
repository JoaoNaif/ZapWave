import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import {
  Friendship,
  FriendshipProps,
} from '@/domain/social/entities/friendship'
import { faker } from '@faker-js/faker'

export function makeFriendship(
  override: Partial<FriendshipProps> = {},
  id?: UniqueEntityId
) {
  const friendship = Friendship.create(
    {
      senderId: faker.string.uuid(),
      recipientId: faker.string.uuid(),
      ...override,
    },
    id
  )

  return friendship
}
