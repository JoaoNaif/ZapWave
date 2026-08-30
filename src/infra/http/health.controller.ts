import { Controller, Get } from '@nestjs/common'

/**
 * Placeholder de infraestrutura só para confirmar que o app sobe.
 * Pode ser removido/substituído quando o health check "de verdade"
 * (ping no Postgres e no Redis) for implementado.
 */
@Controller('health')
export class HealthController {
  @Get()
  handle() {
    return { status: 'ok' }
  }
}
