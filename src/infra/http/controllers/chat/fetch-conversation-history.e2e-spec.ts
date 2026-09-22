import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { monotonicFactory } from 'ulid'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Conversation History (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  const nextUlid = monotonicFactory()

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

  async function createRoom() {
    const owner = await createSession()

    const response = await owner.agent
      .post('/room')
      .send({ name: 'team-zapwave' })

    return { owner, roomId: response.body.room.id as string }
  }

  async function createMessages(
    conversationId: string,
    senderId: string,
    amount: number
  ) {
    const ids: string[] = []

    for (let i = 1; i <= amount; i++) {
      const id = nextUlid()

      await prisma.message.create({
        data: { id, conversationId, senderId, body: `message ${i}` },
      })

      ids.push(id)
    }

    return ids
  }

  test('[GET] /conversation-history/:conversation', async () => {
    const { owner, roomId } = await createRoom()
    const [oldestId, newestId] = await createMessages(roomId, owner.userId, 2)

    const response = await owner.agent.get(`/conversation-history/${roomId}`)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      messages: [
        {
          id: newestId,
          conversationId: roomId,
          senderId: owner.userId,
          body: 'message 2',
          clientMessageId: null,
          createdAt: expect.any(String),
        },
        {
          id: oldestId,
          conversationId: roomId,
          senderId: owner.userId,
          body: 'message 1',
          clientMessageId: null,
          createdAt: expect.any(String),
        },
      ],
      hasMore: false,
    })
  })

  test('[GET] /conversation-history/:conversation with no messages', async () => {
    const { owner, roomId } = await createRoom()

    const response = await owner.agent.get(`/conversation-history/${roomId}`)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ messages: [], hasMore: false })
  })

  test('[GET] /conversation-history/:conversation as a regular member', async () => {
    const { owner, roomId } = await createRoom()
    const member = await createSession()

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: member.userId, role: 'MEMBER' },
    })
    await createMessages(roomId, owner.userId, 1)

    const response = await member.agent.get(`/conversation-history/${roomId}`)

    expect(response.statusCode).toBe(200)
    expect(response.body.messages).toHaveLength(1)
  })

  test('[GET] /conversation-history/:conversation paginates with limit and before', async () => {
    const { owner, roomId } = await createRoom()
    const ids = await createMessages(roomId, owner.userId, 5)

    const firstPage = await owner.agent
      .get(`/conversation-history/${roomId}`)
      .query({ limit: 3 })

    expect(firstPage.statusCode).toBe(200)
    expect(firstPage.body.hasMore).toBe(true)
    expect(firstPage.body.messages.map((m: { id: string }) => m.id)).toEqual([
      ids[4],
      ids[3],
      ids[2],
    ])

    const secondPage = await owner.agent
      .get(`/conversation-history/${roomId}`)
      .query({ limit: 3, before: ids[2] })

    expect(secondPage.statusCode).toBe(200)
    expect(secondPage.body.hasMore).toBe(false)
    expect(secondPage.body.messages.map((m: { id: string }) => m.id)).toEqual([
      ids[1],
      ids[0],
    ])
  })

  test('[GET] /conversation-history/:conversation only returns messages of that conversation', async () => {
    const { owner, roomId } = await createRoom()
    const otherRoom = await owner.agent.post('/room').send({ name: 'other' })

    await createMessages(roomId, owner.userId, 1)
    await createMessages(otherRoom.body.room.id, owner.userId, 2)

    const response = await owner.agent.get(`/conversation-history/${roomId}`)

    expect(response.statusCode).toBe(200)
    expect(response.body.messages).toHaveLength(1)
  })

  test('[GET] /conversation-history/:conversation without a token fails', async () => {
    const { roomId } = await createRoom()

    const response = await request(app.getHttpServer()).get(
      `/conversation-history/${roomId}`
    )

    expect(response.statusCode).toBe(401)
  })

  test('[GET] /conversation-history/:conversation with an invalid id fails', async () => {
    const user = await createSession()

    const response = await user.agent.get('/conversation-history/not-an-uuid')

    expect(response.statusCode).toBe(400)
  })

  test('[GET] /conversation-history/:conversation with an invalid query fails', async () => {
    const { owner, roomId } = await createRoom()

    const invalidLimit = await owner.agent
      .get(`/conversation-history/${roomId}`)
      .query({ limit: 1000 })

    const invalidBefore = await owner.agent
      .get(`/conversation-history/${roomId}`)
      .query({ before: 'not-an-ulid' })

    expect(invalidLimit.statusCode).toBe(400)
    expect(invalidBefore.statusCode).toBe(400)
  })

  test('[GET] /conversation-history/:conversation on an unknown conversation fails', async () => {
    const user = await createSession()

    const response = await user.agent.get(
      `/conversation-history/${faker.string.uuid()}`
    )

    expect(response.statusCode).toBe(404)
  })

  test('[GET] /conversation-history/:conversation by a user who is not a member fails', async () => {
    const { owner, roomId } = await createRoom()
    const stranger = await createSession()

    await createMessages(roomId, owner.userId, 1)

    const response = await stranger.agent.get(`/conversation-history/${roomId}`)

    expect(response.statusCode).toBe(404)
  })
})
