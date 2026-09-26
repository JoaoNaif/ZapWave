import { Public } from '@/infra/auth/public'
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Res,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import { Response } from 'express'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { AuthenticateUserUseCase } from '@/domain/accounts/applications/use-cases/authenticate-user'
import { EnvService } from '@/infra/env/env.service'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { WrongCredentialsError } from '@/domain/accounts/applications/errors/wrong-credentials-error'

const authenticateUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceName: z.string().nullable(),
})

type AuthenticateUserBodySchema = z.infer<typeof authenticateUserBodySchema>

@Controller()
@Public()
export class AuthenticateUserController {
  constructor(
    private authenticateUser: AuthenticateUserUseCase,
    private env: EnvService
  ) {}

  // 10 tentativas por minuto por IP: trava tentativa de adivinhar senha
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('/sessions')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(authenticateUserBodySchema))
  async handle(
    @Body() body: AuthenticateUserBodySchema,
    @Res({ passthrough: true }) response: Response
  ) {
    const { deviceName, email, password } = body

    const result = await this.authenticateUser.execute({
      email,
      password,
      deviceName,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceNotFoundError:
          throw new NotFoundException(error.message)
        case WrongCredentialsError:
          throw new UnauthorizedException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { accessToken, deviceId } = result.value

    response.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: this.env.get('NODE_ENV') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    })

    return {
      device_id: deviceId,
    }
  }
}
