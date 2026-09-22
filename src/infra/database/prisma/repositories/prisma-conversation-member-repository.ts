import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { PrismaConversationMemberMapper } from '../mappers/prisma-conversation-member-mapper'

@Injectable()
export class PrismaConversationMemberRepository
  implements ConversationMemberRepository
{
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ConversationMember | null> {
    const conversationMember = await this.prisma.conversationMember.findUnique({
      where: { id },
    })

    if (!conversationMember) {
      return null
    }

    return PrismaConversationMemberMapper.toDomain(conversationMember)
  }

  async findManyByUserId(userId: string): Promise<ConversationMember[]> {
    const conversationMembers = await this.prisma.conversationMember.findMany({
      where: { userId },
    })

    return conversationMembers.map(PrismaConversationMemberMapper.toDomain)
  }

  async findManyByConversationId(
    conversationId: string
  ): Promise<ConversationMember[]> {
    const conversationMembers = await this.prisma.conversationMember.findMany({
      where: { conversationId },
    })

    return conversationMembers.map(PrismaConversationMemberMapper.toDomain)
  }

  async findByUserWithConversationId(
    userId: string,
    conversationId: string
  ): Promise<ConversationMember | null> {
    const conversationMember = await this.prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId,
        },
      },
    })

    if (!conversationMember) {
      return null
    }

    return PrismaConversationMemberMapper.toDomain(conversationMember)
  }

  async create(conversationMember: ConversationMember): Promise<void> {
    const data = PrismaConversationMemberMapper.toPrisma(conversationMember)

    await this.prisma.conversationMember.create({
      data,
    })
  }

  async save(conversationMember: ConversationMember): Promise<void> {
    const data = PrismaConversationMemberMapper.toPrisma(conversationMember)

    await this.prisma.conversationMember.update({
      where: { id: conversationMember.id.toString() },
      data,
    })
  }

  async delete(conversationMember: ConversationMember): Promise<void> {
    await this.prisma.conversationMember.delete({
      where: { id: conversationMember.id.toString() },
    })
  }
}
