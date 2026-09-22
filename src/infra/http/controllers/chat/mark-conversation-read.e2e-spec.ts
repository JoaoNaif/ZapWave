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

describe('Mark Conversation Read (e2e)', () => {
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

  async function createRoomWithMessages(amount: number) {
    const owner = await createSession()

    const response = await owner.agent
      .post('/room')
      .send({ name: 'team-zapwave' })

    const roomId = response.body.room.id as string
    const messageIds: string[] = []

    for (let i = 1; i <= amount; i++) {
      const id = nextUlid()

      await prisma.message.create({
        data: {
          id,
          conversationId: roomId,
          senderId: owner.userId,
          body: `message ${i}`,
        },
      })

      messageIds.push(id)
    }

    return { owner, roomId, messageIds }
  }

  async function findLastReadMessageId(roomId: string, userId: string) {
    const member = await prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: roomId, userId } },
    })

    return member?.lastReadMessageId
  }

  test('[PUT] /mark-conversation', async () => {
    const { owner, roomId, messageIds } = await createRoomWithMessages(2)

    const response = await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ read: true })
    expect(await findLastReadMessageId(roomId, owner.userId)).toBe(
      messageIds[0]
    )
  })

  test('[PUT] /mark-conversation advances the cursor to a newer message', async () => {
    const { owner, roomId, messageIds } = await createRoomWithMessages(2)

    await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    const response = await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[1] })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ read: true })
    expect(await findLastReadMessageId(roomId, owner.userId)).toBe(
      messageIds[1]
    )
  })

  test('[PUT] /mark-conversation does not regress the cursor to an older message', async () => {
    const { owner, roomId, messageIds } = await createRoomWithMessages(2)

    await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[1] })

    const response = await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ read: false })
    expect(await findLastReadMessageId(roomId, owner.userId)).toBe(
      messageIds[1]
    )
  })

  test('[PUT] /mark-conversation on the same message twice', async () => {
    const { owner, roomId, messageIds } = await createRoomWithMessages(1)

    await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    const response = await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ read: true })
  })

  test('[PUT] /mark-conversation only moves the cursor of the requesting member', async () => {
    const { owner, roomId, messageIds } = await createRoomWithMessages(1)
    const member = await createSession()

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: member.userId, role: 'MEMBER' },
    })

    await member.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    expect(await findLastReadMessageId(roomId, member.userId)).toBe(
      messageIds[0]
    )
    expect(await findLastReadMessageId(roomId, owner.userId)).toBeNull()
  })

  test('deleting the last read message keeps the member and clears its cursor', async () => {
    const { owner, roomId, messageIds } = await createRoomWithMessages(1)

    await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    await prisma.message.delete({ where: { id: messageIds[0] } })

    const member = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: roomId, userId: owner.userId },
      },
    })

    expect(member).not.toBeNull()
    expect(member?.lastReadMessageId).toBeNull()
  })

  test('[PUT] /mark-conversation without a token fails', async () => {
    const { roomId, messageIds } = await createRoomWithMessages(1)

    const response = await request(app.getHttpServer())
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(401)
  })

  test('[PUT] /mark-conversation with an invalid body fails', async () => {
    const { owner, roomId, messageIds } = await createRoomWithMessages(1)

    const invalidConversation = await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: 'not-an-uuid', messageId: messageIds[0] })

    const invalidMessage = await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: 'not-an-ulid' })

    expect(invalidConversation.statusCode).toBe(400)
    expect(invalidMessage.statusCode).toBe(400)
  })

  test('[PUT] /mark-conversation on an unknown conversation fails', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)

    const response = await owner.agent
      .put('/mark-conversation')
      .send({ conversationId: faker.string.uuid(), messageId: messageIds[0] })

    expect(response.statusCode).toBe(404)
  })

  test('[PUT] /mark-conversation by a user who is not a member fails', async () => {
    const { roomId, messageIds } = await createRoomWithMessages(1)
    const stranger = await createSession()

    const response = await stranger.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(404)
  })
})
