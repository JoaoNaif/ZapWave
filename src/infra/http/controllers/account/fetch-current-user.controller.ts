import {
  BadRequestException,
  Controller,
  Get,
  UnauthorizedException,
} from '@nestjs/common'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { FetchCurrentUserUseCase } from '@/domain/accounts/applications/use-cases/fetch-current-user'
import { CurrentUser } from '@/infra/auth/current-user-decorator'
import { UserPayload } from '@/infra/auth/jwt-strategy'

// "Quem sou eu": o front chama isso ao abrir/recarregar a página. 401 = não
// está logado (sem cookie, cookie expirado ou device revogado — o guard já
// barra antes de chegar aqui).
@Controller()
export class FetchCurrentUserController {
  constructor(private fetchCurrentUser: FetchCurrentUserUseCase) {}

  @Get('/me')
  async handle(@CurrentUser() payload: UserPayload) {
    const result = await this.fetchCurrentUser.execute({ userId: payload.sub })

    if (result.isLeft()) {
      const error = result.value

      switch (error.constructor) {
        // token válido de um usuário que não existe mais = sessão inútil
        case ResourceNotFoundError:
          throw new UnauthorizedException()
        default:
          throw new BadRequestException(error.message)
      }
    }

    const { user } = result.value

    // deviceId vem do token (é da sessão, não do usuário): é com ele que o
    // front abre o WebSocket e revoga a própria sessão
    return { user, deviceId: payload.deviceId }
  }
}
