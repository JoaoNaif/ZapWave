import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Send Message (e2e)', () => {
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

  async function createRoom() {
    const owner = await createSession()

    const response = await owner.agent
      .post('/room')
      .send({ name: 'team-zapwave' })

    return { owner, roomId: response.body.room.id as string }
  }

  test('[POST] /message', async () => {
    const { owner, roomId } = await createRoom()

    const response = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi, tudo bem?' })

    expect(response.statusCode).toBe(201)
    expect(response.body).toEqual({
      message: {
        id: expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}$/),
        conversationId: roomId,
        senderId: owner.userId,
        body: 'oi, tudo bem?',
        clientMessageId: null,
        createdAt: expect.any(String),
      },
    })

    const messageOnDatabase = await prisma.message.findUnique({
      where: { id: response.body.message.id },
    })

    expect(messageOnDatabase).toEqual(
      expect.objectContaining({
        conversationId: roomId,
        senderId: owner.userId,
        body: 'oi, tudo bem?',
        clientMessageId: null,
      })
    )
  })

  test('[POST] /message with a clientMessageId', async () => {
    const { owner, roomId } = await createRoom()
    const clientMessageId = faker.string.uuid()

    const response = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi', clientMessageId })

    expect(response.statusCode).toBe(201)
    expect(response.body.message.clientMessageId).toBe(clientMessageId)

    const messageOnDatabase = await prisma.message.findUnique({
      where: { id: response.body.message.id },
    })

    expect(messageOnDatabase?.clientMessageId).toBe(clientMessageId)
  })

  test('[POST] /message with the same clientMessageId does not duplicate the message', async () => {
    const { owner, roomId } = await createRoom()
    const clientMessageId = faker.string.uuid()

    const first = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi', clientMessageId })

    const retry = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi', clientMessageId })

    expect(first.statusCode).toBe(201)
    expect(retry.statusCode).toBe(201)
    expect(retry.body.message).toEqual(first.body.message)

    const messagesOnDatabase = await prisma.message.count({
      where: { conversationId: roomId },
    })

    expect(messagesOnDatabase).toBe(1)
  })

  test('[POST] /message with the same clientMessageId from different senders creates both', async () => {
    const { owner, roomId } = await createRoom()
    const member = await createSession()
    const clientMessageId = faker.string.uuid()

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: member.userId, role: 'MEMBER' },
    })

    const fromOwner = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi', clientMessageId })

    const fromMember = await member.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi', clientMessageId })

    expect(fromOwner.statusCode).toBe(201)
    expect(fromMember.statusCode).toBe(201)
    expect(fromMember.body.message.id).not.toBe(fromOwner.body.message.id)
  })

  test('[POST] /message without clientMessageId always creates a new message', async () => {
    const { owner, roomId } = await createRoom()

    await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi' })
    await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi' })

    const messagesOnDatabase = await prisma.message.count({
      where: { conversationId: roomId },
    })

    expect(messagesOnDatabase).toBe(2)
  })

  test('[POST] /message as a regular member', async () => {
    const { roomId } = await createRoom()
    const member = await createSession()

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: member.userId, role: 'MEMBER' },
    })

    const response = await member.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi' })

    expect(response.statusCode).toBe(201)
    expect(response.body.message.senderId).toBe(member.userId)
  })

  test('[POST] /message shows up in the conversation history', async () => {
    const { owner, roomId } = await createRoom()

    const first = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'primeira' })
    const second = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'segunda' })

    const history = await owner.agent.get(`/conversation-history/${roomId}`)

    expect(history.statusCode).toBe(200)
    expect(history.body.messages.map((m: { id: string }) => m.id)).toEqual([
      second.body.message.id,
      first.body.message.id,
    ])
  })

  test('[POST] /message without a token fails', async () => {
    const { roomId } = await createRoom()

    const response = await request(app.getHttpServer())
      .post('/message')
      .send({ conversationId: roomId, body: 'oi' })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /message with an invalid body fails', async () => {
    const { owner, roomId } = await createRoom()

    const invalidBodies = [
      { conversationId: 'not-an-uuid', body: 'oi' },
      { conversationId: roomId },
      { conversationId: roomId, body: '' },
      { conversationId: roomId, body: '   ' },
      { conversationId: roomId, body: 'a'.repeat(4001) },
      { conversationId: roomId, body: 'oi', clientMessageId: 'not-an-uuid' },
    ]

    for (const invalidBody of invalidBodies) {
      const response = await owner.agent.post('/message').send(invalidBody)

      expect(response.statusCode).toBe(400)
    }

    const messagesOnDatabase = await prisma.message.count({
      where: { conversationId: roomId },
    })

    expect(messagesOnDatabase).toBe(0)
  })

  test('[POST] /message on an unknown conversation fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .post('/message')
      .send({ conversationId: faker.string.uuid(), body: 'oi' })

    expect(response.statusCode).toBe(404)
  })

  test('[POST] /message by a user who is not a member fails', async () => {
    const { roomId } = await createRoom()
    const stranger = await createSession()

    const response = await stranger.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi' })

    expect(response.statusCode).toBe(404)

    const messagesOnDatabase = await prisma.message.count({
      where: { conversationId: roomId },
    })

    expect(messagesOnDatabase).toBe(0)
  })
})
