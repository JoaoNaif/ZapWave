import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { ExtractJwt } from 'passport-jwt'
import { IncomingMessage } from 'node:http'
import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { Device } from '@/domain/accounts/entities/device'
import { tokenPayloadSchema } from '../auth/jwt-strategy'
import { EnvService } from '../env/env.service'

export interface WsHandshakeContext {
  userId: string
  device: Device
}

// A conexão WS não passa pelo cookie-parser nem pelos guards HTTP (o upgrade
// pula o pipeline normal do Express) — por isso repete aqui, à mão, a mesma
// extração de token que o JwtStrategy faz para requests HTTP.
function extractToken(request: IncomingMessage): string | null {
  const cookieHeader = request.headers.cookie

  if (cookieHeader) {
    const accessTokenCookie = cookieHeader
      .split(';')
      .map((pair) => pair.trim())
      .find((pair) => pair.startsWith('access_token='))

    if (accessTokenCookie) {
      return decodeURIComponent(accessTokenCookie.slice('access_token='.length))
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ExtractJwt.fromAuthHeaderAsBearerToken()(request as any)
}

function extractDeviceId(request: IncomingMessage): string | null {
  if (!request.url) return null

  const url = new URL(request.url, 'http://placeholder')
  return url.searchParams.get('deviceId')
}

@Injectable()
export class WsAuthService {
  constructor(
    private jwtService: JwtService,
    private devicesRepository: DevicesRepository,
    private env: EnvService
  ) {}

  // O CORS não vale pra WebSocket: qualquer página aberta no navegador consegue
  // abrir um WS pro nosso servidor e o navegador manda o cookie junto. Quem
  // barra isso é o header Origin, que o navegador preenche sozinho e a página
  // não consegue forjar. Sem Origin = cliente que não é navegador (curl, app,
  // teste) — esse não é o risco, e continua precisando de token válido.
  private isOriginAllowed(request: IncomingMessage) {
    const origin = request.headers.origin
    if (!origin) return true

    return this.env.get('CORS_ORIGINS').includes(origin)
  }

  // null = handshake recusado; o gateway decide o close code a partir de onde
  // ela falhou não é exposto aqui de propósito — tudo que não autentica limpo
  // vira "unauthorized" pro cliente, sem vazar qual etapa falhou.
  async authenticate(
    request: IncomingMessage
  ): Promise<WsHandshakeContext | null> {
    if (!this.isOriginAllowed(request)) return null

    const token = extractToken(request)
    if (!token) return null

    let userId: string
    try {
      const payload = await this.jwtService.verifyAsync(token)
      userId = tokenPayloadSchema.parse(payload).sub
    } catch {
      return null
    }

    const deviceId = extractDeviceId(request)
    if (!deviceId) return null

    const device = await this.devicesRepository.findById(deviceId)
    if (!device) return null

    if (device.userId.toString() !== userId || device.isRevoked) return null

    return { userId, device }
  }
}
