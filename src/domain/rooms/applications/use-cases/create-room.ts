import { Either, right } from '@/core/either'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { Conversation } from '@/domain/chat/entities/conversation'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { ConversationMemberRepository } from '@/domain/chat/applications/repositories/conversation-member-repository'

interface CreateRoomReq {
  name: string
  userId: string
}

type CreateRoomRes = Either<
  never,
  { room: Conversation; owner: ConversationMember }
>

export class CreateRoomUseCase {
  constructor(
    private conversationRepository: ConversationRepository,
    private conversationMemberRepository: ConversationMemberRepository
  ) {}

  async execute({ name, userId }: CreateRoomReq): Promise<CreateRoomRes> {
    // TODO(infra): create() da Conversation + do ConversationMember do owner são
    // 2 escritas separadas — se o processo cair no meio, sobra Conversation
    // órfã sem membro. Envolver num $transaction do Prisma (ou um método
    // tipo createWithMembers) quando o PrismaConversationRepository existir.
    const conversation = Conversation.create({
      name,
      type: 'room',
      createdById: new UniqueEntityId(userId),
    })

    await this.conversationRepository.create(conversation)

    const conversationMember = ConversationMember.create({
      userId: new UniqueEntityId(userId),
      conversationId: conversation.id,
      role: 'owner',
      lastReadMessageId: null,
    })

    await this.conversationMemberRepository.create(conversationMember)

    return right({ room: conversation, owner: conversationMember })
  }
}
