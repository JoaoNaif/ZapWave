import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Send Friend Invite (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
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

  test('[POST] /invite-friendship', async () => {
    const sender = await createSession()
    const recipient = await createSession()

    const response = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    expect(response.statusCode).toBe(201)
    expect(response.body).toEqual({
      friendship: expect.objectContaining({
        id: expect.any(String),
        senderId: sender.userId,
        recipientId: recipient.userId,
        status: 'pending',
      }),
    })

    const friendshipOnDatabase = await prisma.friendship.findUnique({
      where: { id: response.body.friendship.id },
    })

    expect(friendshipOnDatabase).not.toBeNull()
    expect(friendshipOnDatabase?.status).toEqual('PENDING')
  })

  test('[POST] /invite-friendship without a token fails', async () => {
    const recipient = await createSession()

    const response = await request(app.getHttpServer())
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /invite-friendship to yourself fails', async () => {
    const sender = await createSession()

    const response = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: sender.userId })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /invite-friendship to an unknown recipient fails', async () => {
    const sender = await createSession()

    const response = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: faker.string.uuid() })

    expect(response.statusCode).toBe(404)
  })

  test('[POST] /invite-friendship with an already existing invite fails', async () => {
    const sender = await createSession()
    const recipient = await createSession()

    await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    const response = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    expect(response.statusCode).toBe(409)
  })

  test('[POST] /invite-friendship with an invalid body fails', async () => {
    const sender = await createSession()

    const response = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: 'not-an-uuid' })

    expect(response.statusCode).toBe(400)
  })
})
