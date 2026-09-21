import { MessageRepository } from '@/domain/chat/applications/repositories/message-repository'
import { Message } from '@/domain/chat/entities/message'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { PrismaMessageMapper } from '../mappers/prisma-message-mapper'

@Injectable()
export class PrismaMessageRepository implements MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Message | null> {
    const message = await this.prisma.message.findUnique({
      where: { id },
    })

    if (!message) {
      return null
    }

    return PrismaMessageMapper.toDomain(message)
  }

  async findByClientMessageId(
    conversationId: string,
    senderId: string,
    clientMessageId: string
  ): Promise<Message | null> {
    const message = await this.prisma.message.findUnique({
      where: {
        conversationId_senderId_clientMessageId: {
          conversationId,
          senderId,
          clientMessageId,
        },
      },
    })

    if (!message) {
      return null
    }

    return PrismaMessageMapper.toDomain(message)
  }

  async findManyByConversationId(
    conversationId: string,
    { before, limit }: { before?: string; limit: number }
  ): Promise<Message[]> {
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        // ids são ULID: comparação lexicográfica já ordena por tempo de criação
        ...(before ? { id: { lt: before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: limit,
    })

    return messages.map(PrismaMessageMapper.toDomain)
  }

  async create(message: Message): Promise<void> {
    const data = PrismaMessageMapper.toPrisma(message)

    await this.prisma.message.create({
      data,
    })
  }

  async save(message: Message): Promise<void> {
    const data = PrismaMessageMapper.toPrisma(message)

    await this.prisma.message.update({
      where: { id: message.id.toString() },
      data,
    })
  }

  async delete(message: Message): Promise<void> {
    await this.prisma.message.delete({
      where: { id: message.id.toString() },
    })
  }
}
