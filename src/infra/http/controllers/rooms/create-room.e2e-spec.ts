import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Create Room (e2e)', () => {
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

  test('[POST] /room', async () => {
    const { agent, userId } = await createSession()

    const response = await agent.post('/room').send({ name: 'team-zapwave' })

    expect(response.statusCode).toBe(201)
    expect(response.body).toEqual({
      room: {
        id: expect.any(String),
        name: 'team-zapwave',
        type: 'room',
        createdById: userId,
        createdAt: expect.any(String),
      },
      owner: {
        id: expect.any(String),
        roomId: response.body.room.id,
        userId,
        role: 'owner',
        joinedAt: expect.any(String),
        lastReadMessageId: null,
      },
    })

    const roomOnDatabase = await prisma.conversation.findUnique({
      where: { id: response.body.room.id },
    })

    expect(roomOnDatabase).toEqual(
      expect.objectContaining({
        name: 'team-zapwave',
        type: 'ROOM',
        createdById: userId,
      })
    )

    const ownerOnDatabase = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: response.body.room.id,
          userId,
        },
      },
    })

    expect(ownerOnDatabase?.role).toEqual('OWNER')
  })

  test('[POST] /room without a token fails', async () => {
    const response = await request(app.getHttpServer())
      .post('/room')
      .send({ name: 'team-zapwave' })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /room with an invalid body fails', async () => {
    const { agent, userId } = await createSession()

    const response = await agent.post('/room').send({})

    expect(response.statusCode).toBe(400)

    const roomsOnDatabase = await prisma.conversation.count({
      where: { createdById: userId },
    })

    expect(roomsOnDatabase).toBe(0)
  })
})
