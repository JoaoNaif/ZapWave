import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Delete Message (e2e)', () => {
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

    return { agent, userId: registerResponse.body.user.id as string }
  }

  // sala com o dono e um segundo membro; o dono já mandou uma mensagem
  async function createRoomWithMessage() {
    const owner = await createSession()
    const member = await createSession()

    const roomResponse = await owner.agent
      .post('/room')
      .send({ name: 'team-zapwave' })
    const roomId = roomResponse.body.room.id as string

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: member.userId, role: 'MEMBER' },
    })

    const messageResponse = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'texto original' })

    return {
      owner,
      member,
      roomId,
      messageId: messageResponse.body.message.id as string,
    }
  }

  test('[DELETE] /message/:id', async () => {
    const { owner, roomId, messageId } = await createRoomWithMessage()

    const response = await owner.agent.delete(`/message/${messageId}`)

    expect(response.statusCode).toBe(204)

    const messageOnDatabase = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(messageOnDatabase).toBeNull()

    const history = await owner.agent.get(`/conversation-history/${roomId}`)

    expect(history.body.messages).toEqual([])
  })

  test('[DELETE] /message/:id keeps the replies, now without preview', async () => {
    const { owner, roomId, messageId } = await createRoomWithMessage()

    const reply = await owner.agent.post('/message').send({
      conversationId: roomId,
      body: 'resposta',
      replyToId: messageId,
    })

    await owner.agent.delete(`/message/${messageId}`)

    const history = await owner.agent.get(`/conversation-history/${roomId}`)

    expect(history.body.messages).toEqual([
      expect.objectContaining({
        id: reply.body.message.id,
        body: 'resposta',
        replyTo: null,
      }),
    ])
  })

  test('[DELETE] /message/:id moves the read cursor back instead of resetting it', async () => {
    const { owner, member, roomId, messageId } = await createRoomWithMessage()

    const second = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'segunda' })
    const secondId = second.body.message.id as string

    await member.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: secondId })

    await owner.agent.delete(`/message/${secondId}`)

    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: roomId, userId: member.userId },
      },
    })

    expect(membership?.lastReadMessageId).toBe(messageId)
  })

  test('[DELETE] /message/:id by another member fails with 403', async () => {
    const { member, messageId } = await createRoomWithMessage()

    const response = await member.agent.delete(`/message/${messageId}`)

    expect(response.statusCode).toBe(403)

    const messageOnDatabase = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(messageOnDatabase).not.toBeNull()
  })

  test('[DELETE] /message/:id by a user outside the conversation fails with 404', async () => {
    const { messageId } = await createRoomWithMessage()
    const stranger = await createSession()

    const response = await stranger.agent.delete(`/message/${messageId}`)

    expect(response.statusCode).toBe(404)
  })

  test('[DELETE] /message/:id with an unknown id fails with 404', async () => {
    const { owner } = await createRoomWithMessage()

    const response = await owner.agent.delete(
      '/message/01ARZ3NDEKTSV4RRFFQ69G5FAV'
    )

    expect(response.statusCode).toBe(404)
  })
})
