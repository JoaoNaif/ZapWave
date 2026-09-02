import { FriendshipRepository } from '@/domain/social/applications/repositories/friendship-repository'
import { Friendship } from '@/domain/social/entities/friendship'

export class InMemoryFriendshipRepository implements FriendshipRepository {
  public items: Friendship[] = []

  async findById(id: string): Promise<Friendship | null> {
    const friendship = this.items.find((item) => item.id.toString() === id)

    if (!friendship) {
      return null
    }

    return friendship
  }

  async findBySenderIdAndRecipientId(
    senderId: string,
    recipientId: string
  ): Promise<Friendship | null> {
    const friendship = this.items.find(
      (item) => item.senderId === senderId && item.recipientId === recipientId
    )

    if (!friendship) {
      return null
    }

    return friendship
  }

  async create(friendship: Friendship): Promise<void> {
    this.items.push(friendship)
  }

  async save(friendship: Friendship): Promise<void> {
    const itemIndex = this.items.findIndex((item) => item.id === friendship.id)

    this.items[itemIndex] = friendship
  }

  async delete(friendship: Friendship): Promise<void> {
    const itemIndex = this.items.findIndex((item) => item.id === friendship.id)

    this.items.splice(itemIndex, 1)
  }
}
