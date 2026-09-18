import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Put,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { RevokeDeviceUseCase } from '@/domain/accounts/applications/use-cases/revoke-device'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'

const revokeDeviceBodySchema = z.object({
  deviceId: z.string().uuid(),
})

type RevokeDeviceBodySchema = z.infer<typeof revokeDeviceBodySchema>

@Controller()
export class RevokeDeviceController {
  constructor(private revokeDevice: RevokeDeviceUseCase) {}

  @Put('/revoke-device')
  @HttpCode(204)
  @UsePipes(new ZodValidationPipe(revokeDeviceBodySchema))
  async handle(
    @Body() body: RevokeDeviceBodySchema,
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
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        case NotAllowedError:
          throw new UnauthorizedException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }
  }
}
