import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
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
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { SendFriendInviteUseCase } from '@/domain/social/applications/use-cases/send-friend-invite'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'

const sendFriendInviteBodySchema = z.object({
  recipientId: z.string().uuid(),
})

type SendFriendInviteBodySchema = z.infer<typeof sendFriendInviteBodySchema>

@Controller()
export class SendFriendInviteController {
  constructor(private sendFriendInvite: SendFriendInviteUseCase) {}

  @Post('/invite-friendship')
  @HttpCode(201)
  async handle(
    @Body(new ZodValidationPipe(sendFriendInviteBodySchema))
    body: SendFriendInviteBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { recipientId } = body

    const result = await this.sendFriendInvite.execute({
      recipientId,
      senderId: userId,
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

    const { friendship } = result.value

    return {
      friendship,
    }
  }
}
