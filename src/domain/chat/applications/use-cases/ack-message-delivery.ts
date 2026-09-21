import { Either, left, right } from '@/core/either'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { Injectable } from '@nestjs/common'
import { MessageStream } from '../gateways/message-stream'

interface AckMessageDeliveryReq {
  userId: string
  deviceId: string
  messageId: string
}

type AckMessageDeliveryRes = Either<
  ResourceNotFoundError | NotAllowedError,
  { acknowledged: boolean }
>

@Injectable()
export class AckMessageDeliveryUseCase {
  constructor(
    private devicesRepository: DevicesRepository,
    private messageStream: MessageStream
  ) {}

  async execute({
    userId,
    deviceId,
    messageId,
  }: AckMessageDeliveryReq): Promise<AckMessageDeliveryRes> {
    const device = await this.devicesRepository.findById(deviceId)

    if (!device) return left(new ResourceNotFoundError('device'))

    if (device.userId.toString() !== userId || device.isRevoked)
      return left(new NotAllowedError())

    // ids de Message são ULID (ordenáveis) — evita regressão do cursor
    // se um ACK atrasado chegar fora de ordem
    const isOlderThanCurrentCursor =
      device.resumeCursorId !== null &&
      messageId < device.resumeCursorId.toString()

    if (isOlderThanCurrentCursor) {
      return right({ acknowledged: false })
    }

    device.resumeCursorId = new UniqueEntityId(messageId)
    await this.devicesRepository.save(device)

    await this.messageStream.ack(deviceId, messageId)

    return right({ acknowledged: true })
  }
}
