import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { Conversation } from '@/domain/chat/entities/conversation'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { PrismaService } from '../prisma.service'
import { PrismaConversationMapper } from '../mappers/prisma-conversation-mapper'
import { PrismaConversationMemberMapper } from '../mappers/prisma-conversation-member-mapper'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'

// P2002 = violação de constraint única. Na conversa, a única constraint que
// pode disparar é a do dm_key: já existe uma DM pra esse par de usuários.
const UNIQUE_VIOLATION = 'P2002'

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

  async findManyByIds(ids: string[]): Promise<Conversation[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { id: { in: ids } },
    })

    return conversations.map(PrismaConversationMapper.toDomain)
  }

  async findManyByDmKeys(dmKeys: string[]): Promise<Conversation[]> {
    const conversations = await this.prisma.conversation.findMany({
      where: { dmKey: { in: dmKeys } },
    })

    return conversations.map(PrismaConversationMapper.toDomain)
  }

  async create(conversation: Conversation): Promise<void> {
    const data = PrismaConversationMapper.toPrisma(conversation)

    await this.prisma.conversation.create({
      data,
    })
  }

  // Um create aninhado do Prisma roda numa transação só: se algum membro
  // falhar (ex.: usuário inexistente), a conversa também não é gravada.
  // Lança ResourceAlreadyExistsError se já existe DM pra esse par (dm_key).
  async createWithMembers(
    conversation: Conversation,
    members: ConversationMember[]
  ): Promise<void> {
    try {
      await this.prisma.conversation.create({
        data: {
          ...PrismaConversationMapper.toPrisma(conversation),
          conversationMembers: {
            create: members.map((member) => {
              // o conversationId vem do próprio aninhamento
              const { conversationId, ...data } =
                PrismaConversationMemberMapper.toPrisma(member)
              void conversationId

              return data
            }),
          },
        },
      })
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === UNIQUE_VIOLATION
      ) {
        throw new ResourceAlreadyExistsError('direct conversation')
      }

      throw error
    }
  }

  async save(conversation: Conversation): Promise<void> {
    const data = PrismaConversationMapper.toPrisma(conversation)

    await this.prisma.conversation.update({
      where: { id: conversation.id.toString() },
      data,
    })
  }

  async updateLastMessageAt(
    conversationId: string,
    lastMessageAt: Date
  ): Promise<void> {
    // updateMany porque o where tem condição além do id; o "lt" garante que
    // uma mensagem atrasada não empurra a data pra trás
    await this.prisma.conversation.updateMany({
      where: {
        id: conversationId,
        OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: lastMessageAt } }],
      },
      data: { lastMessageAt },
    })
  }

  async delete(conversation: Conversation): Promise<void> {
    await this.prisma.conversation.delete({
      where: { id: conversation.id.toString() },
    })
  }
}
