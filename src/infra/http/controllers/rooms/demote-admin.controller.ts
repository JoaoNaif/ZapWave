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
import { DemoteAdminUseCase } from '@/domain/rooms/applications/use-cases/demote-admin'

const demoteAdminBodySchema = z.object({
  targetUserId: z.string().uuid(),
  conversationId: z.string().uuid(),
})

type DemoteAdminBodySchema = z.infer<typeof demoteAdminBodySchema>

@Controller()
export class DemoteAdminController {
  constructor(private demoteAdmin: DemoteAdminUseCase) {}

  @Put('/room-demote-admin')
  @HttpCode(204)
  async handle(
    @Body(new ZodValidationPipe(demoteAdminBodySchema))
    body: DemoteAdminBodySchema,
    @CurrentUser() user: UserPayload
  ) {
    const { conversationId, targetUserId } = body

    const result = await this.demoteAdmin.execute({
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
