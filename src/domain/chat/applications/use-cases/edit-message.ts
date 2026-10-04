import { ulid } from 'ulid'
import { Either, left, right } from '@/core/either'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { Injectable } from '@nestjs/common'
import { findRecipientDeviceIds } from '../helpers/find-recipient-device-ids'
import { MessageStream } from '../gateways/message-stream'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'
import { MessageRepository } from '../repositories/message-repository'
import { MessageDto } from '../dtos/message-dto'
import { MessageMapper } from '../mappers/message-mapper'
import { toReplyPreview } from '../mappers/reply-preview-mapper'

interface EditMessageReq {
  userId: string
  messageId: string
  body: string
}

type EditMessageRes = Either<
  ResourceNotFoundError | NotAllowedError,
  { message: MessageDto }
>

@Injectable()
export class EditMessageUseCase {
  constructor(
    private conversationMemberRepository: ConversationMemberRepository,
    private messageRepository: MessageRepository,
    private messageStream: MessageStream,
    private devicesRepository: DevicesRepository
  ) {}

  async execute({
    userId,
    messageId,
    body,
  }: EditMessageReq): Promise<EditMessageRes> {
    const message = await this.messageRepository.findById(messageId)

    if (!message) return left(new ResourceNotFoundError('message'))

    const conversationId = message.conversationId.toString()

    // quem não é (mais) membro da conversa recebe o mesmo erro de mensagem
    // inexistente, para não vazar que ela existe
    const membership =
      await this.conversationMemberRepository.findByUserWithConversationId(
        userId,
        conversationId
      )

    if (!membership) return left(new ResourceNotFoundError('message'))

    if (message.senderId.toString() !== userId) {
      return left(new NotAllowedError())
    }

    message.edit(body)
    await this.messageRepository.save(message)

    // o frame leva a mensagem inteira; se ela é uma resposta, o preview da
    // original vai junto (o repositório só guarda replyToId)
    if (message.replyToId) {
      const original = await this.messageRepository.findById(
        message.replyToId.toString()
      )

      if (original) message.replyTo = toReplyPreview(original)
    }

    const recipientDeviceIds = await findRecipientDeviceIds(
      this.conversationMemberRepository,
      this.devicesRepository,
      conversationId
    )

    // id novo (e não o da mensagem): fica depois de tudo que já foi publicado,
    // então o ack cumulativo e o replay por cursor tratam a edição como
    // qualquer outra entrada do inbox
    await this.messageStream.publishEvent(
      { type: 'message-edited', id: ulid(), message },
      recipientDeviceIds
    )

    return right({ message: MessageMapper.toDto(message) })
  }
}
