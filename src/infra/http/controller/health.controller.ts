import { Controller, Get } from '@nestjs/common'
import { Public } from '@/infra/auth/public'

/**
 * Placeholder de infraestrutura só para confirmar que o app sobe.
 * Pode ser removido/substituído quando o health check "de verdade"
 * (ping no Postgres e no Redis) for implementado.
 */
@Controller('health')
@Public()
export class HealthController {
  @Get()
  handle() {
    return { status: 'ok' }
  }
}
