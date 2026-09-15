import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Put,
  UnauthorizedException,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '../../pipes/zod-validation-pipe'
import { RevokeDeviceUseCase } from '@/domain/accounts/applications/use-cases/revoke-device'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

const revokeDeviceBodySchema = z.object({
  deviceId: z.string().uuid(),
})

const bodyValidationPipe = new ZodValidationPipe(revokeDeviceBodySchema)

type RevokeDeviceBodySchema = z.infer<typeof revokeDeviceBodySchema>

@Controller()
export class RevokeDeviceController {
  constructor(private revokeDevice: RevokeDeviceUseCase) {}

  @Put('/revoke-device')
  @HttpCode(204)
  async handle(
    @Body(bodyValidationPipe) body: RevokeDeviceBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { deviceId } = body

    const result = await this.revokeDevice.execute({
      deviceId,
      userId,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceAlreadyExistsError:
          throw new ConflictException(error.message)
        case NotAllowedError:
          throw new UnauthorizedException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }
  }
}
