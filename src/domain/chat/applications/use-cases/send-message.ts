import { Either, left, right } from '@/core/either'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { Message } from '../../entities/message'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'
import { MessageRepository } from '../repositories/message-repository'
import { MessageStream } from '../gateways/message-stream'

interface SendMessageReq {
  senderId: string
  conversationId: string
  body: string
  clientMessageId?: string
}

type SendMessageRes = Either<ResourceNotFoundError, { message: Message }>

export class SendMessageUseCase {
  constructor(
    private conversationMemberRepository: ConversationMemberRepository,
    private messageRepository: MessageRepository,
    private messageStream: MessageStream
  ) {}

  async execute({
    senderId,
    conversationId,
    body,
    clientMessageId,
  }: SendMessageReq): Promise<SendMessageRes> {
    const membership =
      await this.conversationMemberRepository.findByUserWithConversationId(
        senderId,
        conversationId
      )

    if (!membership) return left(new ResourceNotFoundError('conversation'))

    const message = Message.create({
      conversationId: new UniqueEntityId(conversationId),
      senderId: new UniqueEntityId(senderId),
      body,
      clientMessageId: clientMessageId
        ? new UniqueEntityId(clientMessageId)
        : null,
    })

    await this.messageRepository.create(message)
    await this.messageStream.publish(conversationId, message)

    return right({ message })
  }
}
