import { RegisterUserUseCase } from '@/domain/accounts/applications/use-cases/register-user'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { Public } from '@/infra/auth/public'
import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  HttpCode,
  Post,
  UsePipes,
} from '@nestjs/common'
import z from 'zod'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'

const registerUserBodySchema = z.object({
  email: z.string().email(),
  username: z.string(),
  displayName: z.string(),
  password: z.string().min(6),
})

type RegisterUserBodySchema = z.infer<typeof registerUserBodySchema>

@Controller()
@Public()
export class RegisterUserController {
  constructor(private registerUser: RegisterUserUseCase) {}

  @Post('/register')
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(registerUserBodySchema))
  async handle(@Body() body: RegisterUserBodySchema) {
    const { displayName, email, password, username } = body

    const result = await this.registerUser.execute({
      displayName,
      email,
      password,
      username,
    })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        case ResourceAlreadyExistsError:
          throw new ConflictException(error.message)
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { user } = result.value

    return { user }
  }
}
