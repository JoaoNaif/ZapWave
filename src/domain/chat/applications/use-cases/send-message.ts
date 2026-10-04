import { Either, left, right } from '@/core/either'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { Injectable } from '@nestjs/common'
import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { Message } from '../../entities/message'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'
import { ConversationRepository } from '../repositories/conversation-repository'
import { MessageRepository } from '../repositories/message-repository'
import { MessageStream } from '../gateways/message-stream'
import { MessageDto } from '../dtos/message-dto'
import { MessageMapper } from '../mappers/message-mapper'
import { findRecipientDeviceIds } from '../helpers/find-recipient-device-ids'
import { toReplyPreview } from '../mappers/reply-preview-mapper'

interface SendMessageReq {
  senderId: string
  conversationId: string
  body: string
  clientMessageId?: string
  replyToId?: string
}

type SendMessageRes = Either<ResourceNotFoundError, { message: MessageDto }>

@Injectable()
export class SendMessageUseCase {
  constructor(
    private conversationMemberRepository: ConversationMemberRepository,
    private conversationRepository: ConversationRepository,
    private messageRepository: MessageRepository,
    private messageStream: MessageStream,
    private devicesRepository: DevicesRepository
  ) {}

  async execute({
    senderId,
    conversationId,
    body,
    clientMessageId,
    replyToId,
  }: SendMessageReq): Promise<SendMessageRes> {
    const membership =
      await this.conversationMemberRepository.findByUserWithConversationId(
        senderId,
        conversationId
      )

    if (!membership) return left(new ResourceNotFoundError('conversation'))

    // Retry do cliente: devolve a mensagem já gravada, sem duplicar nem
    // republicar no stream.
    if (clientMessageId) {
      const existingMessage =
        await this.messageRepository.findByClientMessageId(
          conversationId,
          senderId,
          clientMessageId
        )

      if (existingMessage) {
        if (existingMessage.replyToId) {
          const original = await this.messageRepository.findById(
            existingMessage.replyToId.toString()
          )

          if (original) existingMessage.replyTo = toReplyPreview(original)
        }

        return right({ message: MessageMapper.toDto(existingMessage) })
      }
    }

    // só dá para responder a mensagem da própria conversa. Mensagem de outra
    // conversa responde igual a inexistente, para não vazar que ela existe.
    let original: Message | null = null

    if (replyToId) {
      original = await this.messageRepository.findById(replyToId)

      if (!original || original.conversationId.toString() !== conversationId) {
        return left(new ResourceNotFoundError('message'))
      }
    }

    const message = Message.create({
      conversationId: new UniqueEntityId(conversationId),
      senderId: new UniqueEntityId(senderId),
      body,
      clientMessageId: clientMessageId
        ? new UniqueEntityId(clientMessageId)
        : null,
      replyToId: original ? original.id : null,
      // vai junto no frame do stream: o fan-out entrega o preview pronto, sem
      // consulta por device
      replyTo: original ? toReplyPreview(original) : null,
    })

    await this.messageRepository.create(message)
    await this.conversationRepository.updateLastMessageAt(
      conversationId,
      message.createdAt
    )

    const recipientDeviceIds = await findRecipientDeviceIds(
      this.conversationMemberRepository,
      this.devicesRepository,
      conversationId
    )

    await this.messageStream.publish(
      conversationId,
      message,
      recipientDeviceIds
    )

    return right({ message: MessageMapper.toDto(message) })
  }
}
