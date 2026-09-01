import { Either, left, right } from '@/core/either'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { DevicesRepository } from '../repositories/device-repository'
import { SessionGateway } from '../gateways/session-gateway'

interface RevokeDeviceReq {
  userId: string // quem está pedindo (vem do token)
  deviceId: string // qual sessão derrubar
}

type RevokeDeviceRes = Either<ResourceNotFoundError | NotAllowedError, null>

export class RevokeDeviceUseCase {
  constructor(
    private devicesRepository: DevicesRepository,
    private sessionGateway: SessionGateway
  ) {}

  async execute({
    userId,
    deviceId,
  }: RevokeDeviceReq): Promise<RevokeDeviceRes> {
    const device = await this.devicesRepository.findById(deviceId)

    if (!device) {
      return left(new ResourceNotFoundError('device'))
    }

    if (device.userId.toString() !== userId) {
      return left(new NotAllowedError())
    }

    if (device.isRevoked) {
      return right(null)
    }

    device.revoke()
    await this.devicesRepository.save(device)

    await this.sessionGateway.disconnect(deviceId)

    return right(null)
  }
}
