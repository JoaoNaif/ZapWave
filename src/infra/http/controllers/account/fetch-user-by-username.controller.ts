import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import z from 'zod'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { FetchUserByUsernameUseCase } from '@/domain/accounts/applications/use-cases/fetch-user-by-username'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'

const usernameParamSchema = z.string().min(1)

@Controller('/users')
export class FetchUserByUsernameController {
  constructor(private fetchUserByUsername: FetchUserByUsernameUseCase) {}

  // 30 buscas por minuto por IP: como cada busca diz se o username existe,
  // o limite impede alguém de varrer nomes pra listar os usuários
  @Throttle({ default: { ttl: 60_000, limit: 30 } })
  @Get('/:username')
  async handle(
    @Param('username', new ZodValidationPipe(usernameParamSchema))
    username: string
  ) {
    const result = await this.fetchUserByUsername.execute({ username })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { user } = result.value

    return { user }
  }
}
