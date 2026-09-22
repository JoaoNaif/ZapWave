import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Notifications (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    app.use(cookieParser())
    prisma = moduleRef.get(PrismaService)

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

  function createNotification(
    recipientId: string,
    override: { title?: string; readAt?: Date | null } = {}
  ) {
    return prisma.notification.create({
      data: {
        recipientId,
        title: override.title ?? 'Nova notificação',
        content: 'algum conteúdo',
        readAt: override.readAt ?? null,
      },
    })
  }

  test('[GET] /notifications', async () => {
    const user = await createSession()
    const notification = await createNotification(user.userId, {
      title: 'oi',
    })

    const response = await user.agent.get('/notifications')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      notifications: [
        {
          id: notification.id,
          recipientId: user.userId,
          title: 'oi',
          content: 'algum conteúdo',
          readAt: null,
          createdAt: expect.any(String),
        },
      ],
    })
  })

  test('[GET] /notifications returns the most recent first', async () => {
    const user = await createSession()
    await createNotification(user.userId, { title: 'primeira' })
    await new Promise((resolve) => setTimeout(resolve, 10))
    await createNotification(user.userId, { title: 'segunda' })

    const response = await user.agent.get('/notifications')

    expect(response.statusCode).toBe(200)
    expect(
      response.body.notifications.map((n: { title: string }) => n.title)
    ).toEqual(['segunda', 'primeira'])
  })

  test('[GET] /notifications does not return already read notifications', async () => {
    const user = await createSession()
    await createNotification(user.userId, {
      title: 'lida',
      readAt: new Date(),
    })
    await createNotification(user.userId, { title: 'não lida' })

    const response = await user.agent.get('/notifications')

    expect(response.statusCode).toBe(200)
    expect(response.body.notifications).toHaveLength(1)
    expect(response.body.notifications[0].title).toBe('não lida')
  })

  test('[GET] /notifications does not return notifications of another user', async () => {
    const user = await createSession()
    const other = await createSession()
    await createNotification(other.userId)

    const response = await user.agent.get('/notifications')

    expect(response.statusCode).toBe(200)
    expect(response.body.notifications).toHaveLength(0)
  })

  test('[GET] /notifications without a token fails', async () => {
    const response = await request(app.getHttpServer()).get('/notifications')

    expect(response.statusCode).toBe(401)
  })
})
