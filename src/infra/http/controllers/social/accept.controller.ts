import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Put,
  UnauthorizedException,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { AcceptUseCase } from '@/domain/social/applications/use-cases/accept'

const acceptBodySchema = z.object({
  friendshipId: z.string().uuid(),
})

type AcceptBodySchema = z.infer<typeof acceptBodySchema>

@Controller()
export class AcceptController {
  constructor(private accept: AcceptUseCase) {}

  @Put('/invite-friendship-accept')
  @HttpCode(204)
  async handle(
    @Body(new ZodValidationPipe(acceptBodySchema)) body: AcceptBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const userId = user.sub

    const { friendshipId } = body

    const result = await this.accept.execute({
      friendshipId,
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
