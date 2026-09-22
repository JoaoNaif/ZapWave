import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Read Notification (e2e)', () => {
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

  function createNotification(recipientId: string) {
    return prisma.notification.create({
      data: {
        recipientId,
        title: 'Nova notificação',
        content: 'algum conteúdo',
        readAt: null,
      },
    })
  }

  test('[PUT] /notification-read', async () => {
    const user = await createSession()
    const notification = await createNotification(user.userId)

    const response = await user.agent
      .put('/notification-read')
      .send({ notificationId: notification.id })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      notification: {
        id: notification.id,
        recipientId: user.userId,
        title: 'Nova notificação',
        content: 'algum conteúdo',
        readAt: expect.any(String),
        createdAt: expect.any(String),
      },
    })

    const notificationOnDatabase = await prisma.notification.findUnique({
      where: { id: notification.id },
    })

    expect(notificationOnDatabase?.readAt).not.toBeNull()
  })

  test('[PUT] /notification-read removes it from the unread list', async () => {
    const user = await createSession()
    const notification = await createNotification(user.userId)

    await user.agent
      .put('/notification-read')
      .send({ notificationId: notification.id })

    const response = await user.agent.get('/notifications')

    expect(response.body.notifications).toHaveLength(0)
  })

  test('[PUT] /notification-read without a token fails', async () => {
    const user = await createSession()
    const notification = await createNotification(user.userId)

    const response = await request(app.getHttpServer())
      .put('/notification-read')
      .send({ notificationId: notification.id })

    expect(response.statusCode).toBe(401)
  })

  test('[PUT] /notification-read with an invalid body fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .put('/notification-read')
      .send({ notificationId: 'not-an-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[PUT] /notification-read on an unknown notification fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .put('/notification-read')
      .send({ notificationId: faker.string.uuid() })

    expect(response.statusCode).toBe(404)
  })

  test('[PUT] /notification-read by a user who is not the recipient fails', async () => {
    const user = await createSession()
    const other = await createSession()
    const notification = await createNotification(other.userId)

    const response = await user.agent
      .put('/notification-read')
      .send({ notificationId: notification.id })

    expect(response.statusCode).toBe(401)

    const notificationOnDatabase = await prisma.notification.findUnique({
      where: { id: notification.id },
    })

    expect(notificationOnDatabase?.readAt).toBeNull()
  })
})
