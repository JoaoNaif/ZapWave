import { Public } from '@/infra/auth/public'
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
  UnauthorizedException,
  UsePipes,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '../../pipes/zod-validation-pipe'
import { AuthenticateUserUseCase } from '@/domain/accounts/applications/use-cases/authenticate-user'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { WrongCredentialsError } from '@/domain/accounts/applications/errors/wrong-credentials-error'

const authenticateUserBodySchema = z.object({
  email: z.string().email(),
  password: z.string(),
  deviceName: z.string(),
})

type AuthenticateUserBodySchema = z.infer<typeof authenticateUserBodySchema>

@Controller()
@Public()
export class AuthenticateUserController {
  constructor(private authenticateUser: AuthenticateUserUseCase) {}

  @Post('session')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(authenticateUserBodySchema))
  async handle(@Body() body: AuthenticateUserBodySchema) {
    const { deviceName, email, password } = body

    const result = await this.authenticateUser.execute({
      email,
      password,
      deviceName,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceAlreadyExistsError:
          throw new ConflictException(error.message)
        case WrongCredentialsError:
          throw new UnauthorizedException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { accessToken, deviceId } = result.value

    return {
      access_token: accessToken,
      device_id: deviceId,
    }
  }
}
