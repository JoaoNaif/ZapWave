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
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { PromoteToAdminUseCase } from '@/domain/rooms/applications/use-cases/promote-to-admin'

const promoteToAdminBodySchema = z.object({
  targetUserId: z.string().uuid(),
  conversationId: z.string().uuid(),
})

type PromoteToAdminBodySchema = z.infer<typeof promoteToAdminBodySchema>

@Controller()
export class PromoteToAdminController {
  constructor(private promoteToAdmin: PromoteToAdminUseCase) {}

  @Put('/room-promote-admin')
  @HttpCode(204)
  async handle(
    @Body(new ZodValidationPipe(promoteToAdminBodySchema))
    body: PromoteToAdminBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const { conversationId, targetUserId } = body

    const result = await this.promoteToAdmin.execute({
      actorId: user.sub,
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
  }
}
