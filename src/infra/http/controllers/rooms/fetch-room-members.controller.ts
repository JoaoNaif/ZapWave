import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { FetchRoomMembersUseCase } from '@/domain/rooms/applications/use-cases/fetch-room-members'

const roomIdParamSchema = z.string().uuid()

@Controller('/rooms')
export class FetchRoomMembersController {
  constructor(private fetchRoomMembers: FetchRoomMembersUseCase) {}

  @Get('/:id/members')
  async handle(
    @Param('id', new ZodValidationPipe(roomIdParamSchema)) roomId: string,
    @CurrentUser() user: UserPayload
  ) {
    const result = await this.fetchRoomMembers.execute({
      userId: user.sub,
      roomId,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { members } = result.value

    return { members }
  }
}
