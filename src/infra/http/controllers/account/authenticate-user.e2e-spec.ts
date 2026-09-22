import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Authenticate User (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    prisma = moduleRef.get(PrismaService)

    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  async function registerUser(overrides?: {
    email?: string
    password?: string
  }) {
    const email = overrides?.email ?? faker.internet.email()
    const password = overrides?.password ?? '123456'

    await request(app.getHttpServer()).post('/register').send({
      username: faker.internet.username(),
      displayName: faker.person.fullName(),
      email,
      password,
    })

    return { email, password }
  }

  test('[POST] /sessions', async () => {
    const { email, password } = await registerUser()

    const response = await request(app.getHttpServer()).post('/sessions').send({
      email,
      password,
      deviceName: 'Chrome no Windows',
    })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      device_id: expect.any(String),
    })
    expect(response.headers['set-cookie']?.[0]).toEqual(
      expect.stringContaining('access_token=')
    )

    const deviceOnDatabase = await prisma.device.findUnique({
      where: { id: response.body.device_id },
    })

    expect(deviceOnDatabase).not.toBeNull()
    expect(deviceOnDatabase?.name).toEqual('Chrome no Windows')
    expect(deviceOnDatabase?.revokedAt).toBeNull()
  })

  test('[POST] /sessions with a wrong password fails', async () => {
    const { email } = await registerUser()

    const response = await request(app.getHttpServer()).post('/sessions').send({
      email,
      password: 'wrong-password',
      deviceName: 'Chrome no Windows',
    })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /sessions with an unknown email fails', async () => {
    const response = await request(app.getHttpServer()).post('/sessions').send({
      email: faker.internet.email(),
      password: '123456',
      deviceName: 'Chrome no Windows',
    })

    expect(response.statusCode).toBe(404)
  })
})
