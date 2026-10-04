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

interface DeleteMessageReq {
  userId: string
  messageId: string
}

type DeleteMessageRes = Either<
  ResourceNotFoundError | NotAllowedError,
  { conversationId: string }
>

@Injectable()
export class DeleteMessageUseCase {
  constructor(
    private conversationMemberRepository: ConversationMemberRepository,
    private messageRepository: MessageRepository,
    private messageStream: MessageStream,
    private devicesRepository: DevicesRepository
  ) {}

  async execute({
    userId,
    messageId,
  }: DeleteMessageReq): Promise<DeleteMessageRes> {
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

    // Quem marcou esta mensagem como "última lida" ficaria com o cursor null
    // (FK SET NULL) e o contador de não lidas contaria tudo desde que entrou.
    // Recua o cursor para a mensagem anterior da conversa antes de apagar.
    const readers =
      await this.conversationMemberRepository.findManyByLastReadMessageId(
        messageId
      )

    if (readers.length > 0) {
      const [previous] = await this.messageRepository.findManyByConversationId(
        conversationId,
        { before: messageId, limit: 1 }
      )

      for (const reader of readers) {
        reader.lastReadMessageId = previous ? previous.id : null
        await this.conversationMemberRepository.save(reader)
      }
    }

    // apagar de verdade: as respostas a ela ficam com replyTo null (FK SET NULL)
    await this.messageRepository.delete(message)

    const recipientDeviceIds = await findRecipientDeviceIds(
      this.conversationMemberRepository,
      this.devicesRepository,
      conversationId
    )

    await this.messageStream.publishEvent(
      { type: 'message-deleted', id: ulid(), messageId, conversationId },
      recipientDeviceIds
    )

    return right({ conversationId })
  }
}
