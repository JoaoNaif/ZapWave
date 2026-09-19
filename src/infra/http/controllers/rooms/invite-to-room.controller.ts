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
import { InviteToRoomUseCase } from '@/domain/rooms/applications/use-cases/invite-to-room'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'

const inviteToRoomBodySchema = z.object({
  conversationId: z.string().uuid(),
  recipientId: z.string().uuid(),
})

type InviteToRoomBodySchema = z.infer<typeof inviteToRoomBodySchema>

@Controller()
export class InviteToRoomController {
  constructor(private inviteToRoom: InviteToRoomUseCase) {}

  @Post('/room-invite')
  @HttpCode(201)
  async handle(
    @Body(new ZodValidationPipe(inviteToRoomBodySchema))
    body: InviteToRoomBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { conversationId, recipientId } = body

    const result = await this.inviteToRoom.execute({
      senderId: userId,
      conversationId,
      recipientId,
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

    const { invite, room, sender } = result.value

    return {
      room,
      invite,
      sender,
    }
  }
}
