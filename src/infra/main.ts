import { NestFactory } from '@nestjs/core'
import { WsAdapter } from '@nestjs/platform-ws'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'
import { EnvService } from './env/env.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(cookieParser())
  app.useWebSocketAdapter(new WsAdapter(app))

  const env = app.get(EnvService)
  const port = env.get('PORT')

  await app.listen(port)
}

void bootstrap()
