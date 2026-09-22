import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { RedisService } from '@/infra/redis/redis.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Presence (e2e)', () => {
  let app: INestApplication
  let redis: RedisService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    app.use(cookieParser())
    redis = moduleRef.get(RedisService)

    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  async function createSession() {
    const email = faker.internet.email()
    const password = '123456'

    const registerResponse = await request(app.getHttpServer())
      .post('/register')
      .send({
        username: faker.internet.username(),
        displayName: faker.person.fullName(),
        email,
        password,
      })

    const agent = request.agent(app.getHttpServer())

    await agent
      .post('/sessions')
      .send({ email, password, deviceName: 'Chrome no Windows' })

    return {
      agent,
      userId: registerResponse.body.user.id as string,
    }
  }

  test('[GET] /presence/:userId for a user who never connected', async () => {
    const requester = await createSession()
    const target = await createSession()

    const response = await requester.agent.get(`/presence/${target.userId}`)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      presence: {
        userId: target.userId,
        online: false,
        lastSeenAt: null,
      },
    })
  })

  test('[GET] /presence/:userId after a heartbeat', async () => {
    const requester = await createSession()
    const target = await createSession()

    await redis.zadd('presence:online', Date.now(), target.userId)

    const response = await requester.agent.get(`/presence/${target.userId}`)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      presence: {
        userId: target.userId,
        online: true,
        lastSeenAt: expect.any(String),
      },
    })
  })

  test('[GET] /presence/:userId with an invalid id fails', async () => {
    const requester = await createSession()

    const response = await requester.agent.get('/presence/not-an-uuid')

    expect(response.statusCode).toBe(400)
  })

  test('[GET] /presence/:userId without a token fails', async () => {
    const target = await createSession()

    const response = await request(app.getHttpServer()).get(
      `/presence/${target.userId}`
    )

    expect(response.statusCode).toBe(401)
  })
})
