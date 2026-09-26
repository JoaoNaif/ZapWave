import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { z } from 'zod'
import { EnvService } from '../env/env.service'
import { DeviceSessionCache } from './device-session-cache'
import { Request } from 'express'

export const tokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  // device da sessão: é o que permite revogar UM login sem esperar o token
  // expirar (ver DeviceSessionCache)
  deviceId: z.string().uuid(),
})

export type UserPayload = z.infer<typeof tokenPayloadSchema>

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: EnvService,
    private deviceSessions: DeviceSessionCache
  ) {
    const publicKey = config.get('JWT_PUBLIC_KEY')

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Primeiro tenta extrair do cookie (mais seguro)
        (request: Request) => {
          return request?.cookies?.access_token
        },
        // Fallback para o header Authorization
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      secretOrKey: Buffer.from(publicKey, 'base64'),
      algorithms: ['RS256'],
    })
  }

  // Só chega aqui com a assinatura e a validade do token já conferidas. O que
  // falta é saber se a sessão (device) continua de pé: o JWT sozinho vale 24h
  // e não sabe que foi revogado.
  async validate(payload: unknown): Promise<UserPayload> {
    const parsed = tokenPayloadSchema.safeParse(payload)

    // token sem deviceId (emitido antes da revogação existir) = sessão antiga
    if (!parsed.success) throw new UnauthorizedException()

    const { sub, deviceId } = parsed.data

    if (!(await this.deviceSessions.isActive(sub, deviceId))) {
      throw new UnauthorizedException()
    }

    return parsed.data
  }
}
