import {
  MessageRepository,
  UnreadCursor,
} from '@/domain/chat/applications/repositories/message-repository'
import { Message } from '@/domain/chat/entities/message'
import { Injectable } from '@nestjs/common'
import { Message as PrismaMessage } from '@prisma/client'
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

  async findManyByIds(ids: string[]): Promise<Message[]> {
    if (ids.length === 0) return []

    const messages = await this.prisma.message.findMany({
      where: { id: { in: ids } },
    })

    return messages.map(PrismaMessageMapper.toDomain)
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

  async findManyLastByConversationIds(
    conversationIds: string[]
  ): Promise<Message[]> {
    if (conversationIds.length === 0) return []

    // DISTINCT ON fica com a primeira linha de cada conversa na ordem do
    // ORDER BY — a de maior id (ULID = mais nova). Anda no índice
    // (conversationId, id). O `distinct` do Prisma não serve: ele traz tudo e
    // deduplica na engine, ou seja, leria o histórico inteiro.
    const messages = await this.prisma.$queryRaw<PrismaMessage[]>`
      SELECT DISTINCT ON (conversation_id)
        id,
        conversation_id AS "conversationId",
        sender_id AS "senderId",
        body,
        client_message_id AS "clientMessageId",
        reply_to_id AS "replyToId",
        edited_at AS "editedAt",
        created_at AS "createdAt"
      FROM messages
      WHERE conversation_id = ANY(${conversationIds})
      ORDER BY conversation_id, id DESC
    `

    return messages.map(PrismaMessageMapper.toDomain)
  }

  async countUnreadByConversation(
    userId: string,
    cursors: UnreadCursor[]
  ): Promise<Map<string, number>> {
    if (cursors.length === 0) return new Map()

    // um GROUP BY só: cada cursor vira um ramo do OR, e cada ramo é um range
    // no índice (conversationId, id) — ou conversationId + createdAt quando
    // o membro nunca marcou nada como lido
    const groups = await this.prisma.message.groupBy({
      by: ['conversationId'],
      where: {
        senderId: { not: userId },
        OR: cursors.map((cursor) => ({
          conversationId: cursor.conversationId,
          ...(cursor.lastReadMessageId
            ? { id: { gt: cursor.lastReadMessageId } }
            : { createdAt: { gte: cursor.joinedAt } }),
        })),
      },
      _count: { _all: true },
    })

    return new Map(
      groups.map((group) => [group.conversationId, group._count._all])
    )
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
