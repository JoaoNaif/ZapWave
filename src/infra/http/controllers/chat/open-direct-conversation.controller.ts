import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotAcceptableException,
  NotFoundException,
  Post,
  UnauthorizedException,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { OpenDirectConversationUseCase } from '@/domain/chat/applications/use-cases/open-direct-conversation'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { FriendshipNotAcceptedError } from '@/domain/chat/applications/errors/friendship-not-accepted-error'

const openDirectConversationBodySchema = z.object({
  friendId: z.string().uuid(),
})

type OpenDirectConversationBodySchema = z.infer<
  typeof openDirectConversationBodySchema
>

@Controller()
export class OpenDirectConversationController {
  constructor(private openDirectConversation: OpenDirectConversationUseCase) {}

  @Post('/direct-conversation')
  @HttpCode(201)
  async handle(
    @Body(new ZodValidationPipe(openDirectConversationBodySchema))
    body: OpenDirectConversationBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { friendId } = body

    const result = await this.openDirectConversation.execute({
      userId,
      friendId,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        case FriendshipNotAcceptedError:
          throw new NotAcceptableException(error.message)
        case NotAllowedError:
          throw new UnauthorizedException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { conversation, isNewConversation, member } = result.value

    return {
      conversation,
      isNewConversation,
      member,
    }
  }
}
