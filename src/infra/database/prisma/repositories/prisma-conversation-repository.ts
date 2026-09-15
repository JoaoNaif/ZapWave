import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { Conversation } from '@/domain/chat/entities/conversation'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { PrismaConversationMapper } from '../mappers/prisma-conversation-mapper'

@Injectable()
export class PrismaConversationRepository implements ConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Conversation | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    })

    if (!conversation) {
      return null
    }

    return PrismaConversationMapper.toDomain(conversation)
  }

  // NOTA(infra): a Conversation aqui não carrega os participantes, então o
  // dmKey (prisma/schema.prisma) fica sem valor no create() — a proteção
  // contra 2 DMs concorrentes pro mesmo par continua pendente, ver TODO em
  // open-direct-conversation.ts.
  async create(conversation: Conversation): Promise<void> {
    const data = PrismaConversationMapper.toPrisma(conversation)

    await this.prisma.conversation.create({
      data,
    })
  }

  async save(conversation: Conversation): Promise<void> {
    const data = PrismaConversationMapper.toPrisma(conversation)

    await this.prisma.conversation.update({
      where: { id: conversation.id.toString() },
      data,
    })
  }

  async delete(conversation: Conversation): Promise<void> {
    await this.prisma.conversation.delete({
      where: { id: conversation.id.toString() },
    })
  }
}
