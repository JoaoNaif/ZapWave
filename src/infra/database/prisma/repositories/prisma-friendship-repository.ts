import { DomainEvents } from '@/core/events/domain-events'
import { FriendshipRepository } from '@/domain/social/applications/repositories/friendship-repository'
import { Friendship } from '@/domain/social/entities/friendship'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { PrismaFriendshipMapper } from '../mappers/prisma-friendship-mapper'

@Injectable()
export class PrismaFriendshipRepository implements FriendshipRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Friendship | null> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id },
    })

    if (!friendship) {
      return null
    }

    return PrismaFriendshipMapper.toDomain(friendship)
  }

  async findBySenderIdAndRecipientId(
    senderId: string,
    recipientId: string
  ): Promise<Friendship | null> {
    const friendship = await this.prisma.friendship.findFirst({
      where: { senderId, recipientId },
    })

    if (!friendship) {
      return null
    }

    return PrismaFriendshipMapper.toDomain(friendship)
  }

  async create(friendship: Friendship): Promise<void> {
    const data = PrismaFriendshipMapper.toPrisma(friendship)

    await this.prisma.friendship.create({
      data,
    })

    DomainEvents.dispatchEventsForAggregate(friendship.id)
  }

  async save(friendship: Friendship): Promise<void> {
    const data = PrismaFriendshipMapper.toPrisma(friendship)

    await this.prisma.friendship.update({
      where: { id: friendship.id.toString() },
      data,
    })

    DomainEvents.dispatchEventsForAggregate(friendship.id)
  }

  async delete(friendship: Friendship): Promise<void> {
    await this.prisma.friendship.delete({
      where: { id: friendship.id.toString() },
    })
  }
}
