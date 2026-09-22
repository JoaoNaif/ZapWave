import { Either, left, right } from '@/core/either'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { Injectable } from '@nestjs/common'
import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { Message } from '../../entities/message'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'
import { MessageRepository } from '../repositories/message-repository'
import { MessageStream } from '../gateways/message-stream'
import { MessageDto } from '../dtos/message-dto'
import { MessageMapper } from '../mappers/message-mapper'

interface SendMessageReq {
  senderId: string
  conversationId: string
  body: string
  clientMessageId?: string
}

type SendMessageRes = Either<ResourceNotFoundError, { message: MessageDto }>

@Injectable()
export class SendMessageUseCase {
  constructor(
    private conversationMemberRepository: ConversationMemberRepository,
    private messageRepository: MessageRepository,
    private messageStream: MessageStream,
    private devicesRepository: DevicesRepository
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
        return right({ message: MessageMapper.toDto(existingMessage) })
      }
    }

    const message = Message.create({
      conversationId: new UniqueEntityId(conversationId),
      senderId: new UniqueEntityId(senderId),
      body,
      clientMessageId: clientMessageId
        ? new UniqueEntityId(clientMessageId)
        : null,
    })

    await this.messageRepository.create(message)
    // Fan-out: todo device ativo de todo membro (inclusive os outros devices
    // de quem enviou) recebe a mensagem no seu inbox.
    const members =
      await this.conversationMemberRepository.findManyByConversationId(
        conversationId
      )
    const devices = await this.devicesRepository.findManyByUserIds(
      members.map((member) => member.userId.toString())
    )
    const recipientDeviceIds = devices
      .filter((device) => !device.isRevoked)
      .map((device) => device.id.toString())

    await this.messageStream.publish(
      conversationId,
      message,
      recipientDeviceIds
    )

    return right({ message: MessageMapper.toDto(message) })
  }
}
