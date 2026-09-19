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
import { RemoveMemberUseCase } from '@/domain/rooms/applications/use-cases/remove-member'

const removeMemberBodySchema = z.object({
  targetUserId: z.string().uuid(),
  conversationId: z.string().uuid(),
})

type RemoveMemberBodySchema = z.infer<typeof removeMemberBodySchema>

@Controller()
export class RemoveMemberController {
  constructor(private removeMember: RemoveMemberUseCase) {}

  @Delete('/room-remove-member')
  @HttpCode(204)
  async handle(
    @Body(new ZodValidationPipe(removeMemberBodySchema))
    body: RemoveMemberBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { conversationId, targetUserId } = body

    const result = await this.removeMember.execute({
      actorId: userId,
      targetUserId,
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
