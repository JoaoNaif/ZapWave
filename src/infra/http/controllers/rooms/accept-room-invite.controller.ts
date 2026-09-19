import {
  BadRequestException,
  Body,
  ConflictException,
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
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { AcceptRoomInviteUseCase } from '@/domain/rooms/applications/use-cases/accept-room-invite'

const acceptRoomInviteBodySchema = z.object({
  inviteId: z.string().uuid(),
})

type AcceptRoomInviteBodySchema = z.infer<typeof acceptRoomInviteBodySchema>

@Controller()
export class AcceptRoomInviteController {
  constructor(private acceptRoomInvite: AcceptRoomInviteUseCase) {}

  @Post('/room-invite-accept')
  @HttpCode(201)
  async handle(
    @Body(new ZodValidationPipe(acceptRoomInviteBodySchema))
    body: AcceptRoomInviteBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { inviteId } = body

    const result = await this.acceptRoomInvite.execute({
      userId,
      inviteId,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        case NotAllowedError:
          throw new UnauthorizedException(error.message)
        case ResourceAlreadyExistsError:
          throw new ConflictException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { invite, room, member } = result.value

    return {
      room,
      invite,
      member,
    }
  }
}
