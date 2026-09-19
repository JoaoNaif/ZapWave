import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  HttpCode,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { LeaveRoomUseCase } from '@/domain/rooms/applications/use-cases/leave-room'

const leaveRoomBodySchema = z.object({
  conversationId: z.string().uuid(),
})

type LeaveRoomBodySchema = z.infer<typeof leaveRoomBodySchema>

@Controller()
export class LeaveRoomController {
  constructor(private leaveRoom: LeaveRoomUseCase) {}

  @Delete('/room-leave')
  @HttpCode(204)
  async handle(
    @Body(new ZodValidationPipe(leaveRoomBodySchema))
    body: LeaveRoomBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { conversationId } = body

    const result = await this.leaveRoom.execute({
      userId,
      conversationId,
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

    return null
  }
}
