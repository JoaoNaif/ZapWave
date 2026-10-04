import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Edit Message (e2e)', () => {
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

  test('[PATCH] /message/:id', async () => {
    const { owner, messageId } = await createRoomWithMessage()

    const response = await owner.agent
      .patch(`/message/${messageId}`)
      .send({ body: '  texto novo  ' })

    expect(response.statusCode).toBe(200)
    expect(response.body.message).toEqual(
      expect.objectContaining({
        id: messageId,
        body: 'texto novo',
        editedAt: expect.any(String),
      })
    )

    const messageOnDatabase = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(messageOnDatabase?.body).toBe('texto novo')
    expect(messageOnDatabase?.editedAt).toBeInstanceOf(Date)
  })

  test('[PATCH] /message/:id shows up edited in the history', async () => {
    const { owner, roomId, messageId } = await createRoomWithMessage()

    await owner.agent.patch(`/message/${messageId}`).send({ body: 'novo' })

    const history = await owner.agent.get(`/conversation-history/${roomId}`)

    expect(history.body.messages[0]).toEqual(
      expect.objectContaining({
        id: messageId,
        body: 'novo',
        editedAt: expect.any(String),
      })
    )
  })

  test('[PATCH] /message/:id by another member fails with 403', async () => {
    const { member, messageId } = await createRoomWithMessage()

    const response = await member.agent
      .patch(`/message/${messageId}`)
      .send({ body: 'tentando editar' })

    expect(response.statusCode).toBe(403)

    const messageOnDatabase = await prisma.message.findUnique({
      where: { id: messageId },
    })

    expect(messageOnDatabase?.body).toBe('texto original')
  })

  test('[PATCH] /message/:id by a user outside the conversation fails with 404', async () => {
    const { messageId } = await createRoomWithMessage()
    const stranger = await createSession()

    const response = await stranger.agent
      .patch(`/message/${messageId}`)
      .send({ body: 'tentando editar' })

    expect(response.statusCode).toBe(404)
  })

  test('[PATCH] /message/:id with an unknown id fails with 404', async () => {
    const { owner } = await createRoomWithMessage()

    const response = await owner.agent
      .patch('/message/01ARZ3NDEKTSV4RRFFQ69G5FAV')
      .send({ body: 'novo' })

    expect(response.statusCode).toBe(404)
  })

  test('[PATCH] /message/:id with an empty body fails with 400', async () => {
    const { owner, messageId } = await createRoomWithMessage()

    const response = await owner.agent
      .patch(`/message/${messageId}`)
      .send({ body: '   ' })

    expect(response.statusCode).toBe(400)
  })

  test('[PATCH] /message/:id with an invalid id fails with 400', async () => {
    const { owner } = await createRoomWithMessage()

    const response = await owner.agent
      .patch('/message/not-an-ulid')
      .send({ body: 'novo' })

    expect(response.statusCode).toBe(400)
  })
})
