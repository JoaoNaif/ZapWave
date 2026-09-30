import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { DeclineRoomInviteUseCase } from '@/domain/rooms/applications/use-cases/decline-room-invite'

const declineRoomInviteBodySchema = z.object({
  inviteId: z.string().uuid(),
})

type DeclineRoomInviteBodySchema = z.infer<typeof declineRoomInviteBodySchema>

@Controller()
export class DeclineRoomInviteController {
  constructor(private declineRoomInvite: DeclineRoomInviteUseCase) {}

  @Post('/room-invite-decline')
  @HttpCode(204)
  async handle(
    @Body(new ZodValidationPipe(declineRoomInviteBodySchema))
    body: DeclineRoomInviteBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const result = await this.declineRoomInvite.execute({
      userId: user.sub,
      inviteId: body.inviteId,
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
