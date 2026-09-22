import { BadRequestException, Controller, Get, Param } from '@nestjs/common'
import z from 'zod'
import { FetchPresenceUseCase } from '@/domain/chat/applications/use-cases/fetch-presence'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'

const userIdParamSchema = z.string().uuid()

@Controller('/presence')
export class FetchPresenceController {
  constructor(private fetchPresence: FetchPresenceUseCase) {}

  @Get('/:userId')
  async handle(
    @Param('userId', new ZodValidationPipe(userIdParamSchema)) userId: string
  ) {
    const result = await this.fetchPresence.execute({ userId })

    if (result.isLeft()) {
      throw new BadRequestException()
    }

    const { presence } = result.value

    return {
      presence,
    }
  }
}
