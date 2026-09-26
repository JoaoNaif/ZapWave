import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { EnvService } from '@/infra/env/env.service'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'

// O setup dos e2e desliga o limite de requisições (senão os outros testes
// tomam 429). Aqui ele precisa estar ligado — e isso tem que valer antes de
// o AppModule ser importado, porque o env é validado na importação.
vi.hoisted(() => {
  process.env.RATE_LIMIT_ENABLED = 'true'
})

describe('Hardening (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let jwt: JwtService
  let allowedOrigin: string

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    prisma = moduleRef.get(PrismaService)
    jwt = moduleRef.get(JwtService)
    await app.init()

    allowedOrigin = app.get(EnvService).get('CORS_ORIGINS')[0]
  })

  afterAll(async () => {
    await app.close()
  })

  describe('security headers (helmet)', () => {
    test('does not reveal the framework and sends nosniff', async () => {
      const response = await request(app.getHttpServer()).get('/health')

      expect(response.headers['x-powered-by']).toBeUndefined()
      expect(response.headers['x-content-type-options']).toBe('nosniff')
    })
  })

  describe('CORS', () => {
    test('allows a listed origin and lets it send the session cookie', async () => {
      const response = await request(app.getHttpServer())
        .options('/sessions')
        .set('Origin', allowedOrigin)
        .set('Access-Control-Request-Method', 'POST')

      expect(response.headers['access-control-allow-origin']).toBe(
        allowedOrigin
      )
      expect(response.headers['access-control-allow-credentials']).toBe('true')
    })

    test('does not authorize an origin that is not listed', async () => {
      const response = await request(app.getHttpServer())
        .options('/sessions')
        .set('Origin', 'http://evil.example.com')
        .set('Access-Control-Request-Method', 'POST')

      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    })
  })

  describe('rate limit', () => {
    test('blocks login attempts after 10 per minute', async () => {
      const attempt = () =>
        request(app.getHttpServer()).post('/sessions').send({
          email: faker.internet.email(),
          password: 'wrong-password',
          deviceName: null,
        })

      for (let i = 0; i < 10; i++) {
        const response = await attempt()
        expect(response.statusCode).not.toBe(429)
      }

      const blocked = await attempt()

      expect(blocked.statusCode).toBe(429)
    })

    test('blocks sign-ups after 5 per minute', async () => {
      const signUp = () =>
        request(app.getHttpServer()).post('/register').send({
          username: faker.internet.username(),
          displayName: faker.person.fullName(),
          email: faker.internet.email(),
          password: '123456',
        })

      for (let i = 0; i < 5; i++) {
        const response = await signUp()
        expect(response.statusCode).toBe(201)
      }

      const blocked = await signUp()

      expect(blocked.statusCode).toBe(429)
    })

    test('blocks username lookups after 30 per minute', async () => {
      // /register e /sessions já têm o limite esgotado neste arquivo, então a
      // sessão é montada direto no banco, sem passar por essas rotas
      const user = await prisma.user.create({
        data: {
          username: faker.string.alphanumeric(12),
          displayName: 'Buscador',
          email: faker.internet.email(),
          passwordHash: 'not-used',
        },
      })
      const device = await prisma.device.create({ data: { userId: user.id } })
      const token = await jwt.signAsync({ sub: user.id, deviceId: device.id })

      const lookup = () =>
        request(app.getHttpServer())
          .get('/users/ninguem_com_esse_nome')
          .set('Authorization', `Bearer ${token}`)

      for (let i = 0; i < 30; i++) {
        const response = await lookup()
        expect(response.statusCode).toBe(404)
      }

      const blocked = await lookup()

      expect(blocked.statusCode).toBe(429)
    })

    test('the login limit does not affect the rest of the API', async () => {
      const response = await request(app.getHttpServer()).get('/health')

      expect(response.statusCode).toBe(200)
    })
  })
})
