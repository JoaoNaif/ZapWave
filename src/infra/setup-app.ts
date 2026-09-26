import { INestApplication } from '@nestjs/common'
import { WsAdapter } from '@nestjs/platform-ws'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { EnvService } from './env/env.service'

// Tudo que o app precisa além dos módulos. Fica aqui (e não no main.ts) pra o
// mesmo setup poder ser usado nos testes e2e — senão CORS/helmet só existiriam
// no servidor real e nunca seriam testados.
export function configureApp(app: INestApplication) {
  const env = app.get(EnvService)

  // cabeçalhos de segurança (nosniff, sem X-Powered-By, HSTS, etc.)
  app.use(helmet())
  app.use(cookieParser())

  // Só as origens listadas podem chamar a API pelo navegador. credentials:true
  // porque a sessão vai em cookie (access_token).
  app.enableCors({
    origin: env.get('CORS_ORIGINS'),
    credentials: true,
  })

  app.useWebSocketAdapter(new WsAdapter(app))
}
