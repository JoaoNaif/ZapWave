import { ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    // Sempre tenta processar o JWT se existir
    return super.canActivate(context)
  }

  handleRequest(err: any, user: any, info: any) {
    // Se há erro ou não há usuário, retorna null ao invés de falhar
    // Isso permite que o endpoint funcione sem autenticação
    if (err || !user) {
      return null
    }
    return user
  }
}
