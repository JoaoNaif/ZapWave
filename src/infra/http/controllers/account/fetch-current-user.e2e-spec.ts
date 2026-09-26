import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Current User (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    prisma = moduleRef.get(PrismaService)

    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  async function createSession() {
    const email = faker.internet.email()
    const username = faker.internet.username()
    const password = '123456'

    const registerResponse = await request(app.getHttpServer())
      .post('/register')
      .send({
        username,
        displayName: 'Fulano de Tal',
        email,
        password,
      })

    const agent = request.agent(app.getHttpServer())

    const sessionResponse = await agent
      .post('/sessions')
      .send({ email, password, deviceName: 'Chrome no Windows' })

    return {
      agent,
      email,
      username,
      userId: registerResponse.body.user.id as string,
      deviceId: sessionResponse.body.device_id as string,
    }
  }

  test('[GET] /me', async () => {
    const session = await createSession()

    const response = await session.agent.get('/me')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      user: {
        id: session.userId,
        username: session.username,
        displayName: 'Fulano de Tal',
        email: session.email,
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      },
      deviceId: session.deviceId,
    })
    expect(response.body.user).not.toHaveProperty('passwordHash')
  })

  test('[GET] /me returns the device of the cookie used, not another one of the same user', async () => {
    const first = await createSession()

    const secondAgent = request.agent(app.getHttpServer())
    const secondLogin = await secondAgent.post('/sessions').send({
      email: first.email,
      password: '123456',
      deviceName: 'Firefox no Linux',
    })

    const response = await secondAgent.get('/me')

    expect(response.statusCode).toBe(200)
    expect(response.body.deviceId).toBe(secondLogin.body.device_id)
    expect(response.body.deviceId).not.toBe(first.deviceId)
  })

  test('[GET] /me without a cookie fails', async () => {
    const response = await request(app.getHttpServer()).get('/me')

    expect(response.statusCode).toBe(401)
  })

  test('[GET] /me with the cookie of a revoked device fails', async () => {
    const session = await createSession()

    await session.agent
      .put('/revoke-device')
      .send({ deviceId: session.deviceId })

    const response = await session.agent.get('/me')

    expect(response.statusCode).toBe(401)
  })

  test('[GET] /me keeps working for the user other sessions after one is revoked', async () => {
    const first = await createSession()

    const secondAgent = request.agent(app.getHttpServer())
    await secondAgent.post('/sessions').send({
      email: first.email,
      password: '123456',
      deviceName: 'Firefox no Linux',
    })

    await first.agent.put('/revoke-device').send({ deviceId: first.deviceId })

    expect((await first.agent.get('/me')).statusCode).toBe(401)
    expect((await secondAgent.get('/me')).statusCode).toBe(200)
  })

  test('[GET] /me fails when the user no longer exists', async () => {
    const session = await createSession()

    // apagar o usuário leva os devices junto (cascade): o token assinado
    // continua válido, mas a sessão não existe mais
    await prisma.user.delete({ where: { id: session.userId } })

    const response = await session.agent.get('/me')

    expect(response.statusCode).toBe(401)
  })
})
