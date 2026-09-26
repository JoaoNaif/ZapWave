import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Open Direct Conversation (e2e)', () => {
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

  async function createFriends({ accepted }: { accepted: boolean }) {
    const user = await createSession()
    const friend = await createSession()

    const inviteResponse = await user.agent
      .post('/invite-friendship')
      .send({ recipientId: friend.userId })

    if (accepted) {
      await friend.agent
        .put('/invite-friendship-accept')
        .send({ friendshipId: inviteResponse.body.friendship.id })
    }

    return { user, friend }
  }

  test('[POST] /direct-conversation', async () => {
    const { user, friend } = await createFriends({ accepted: true })

    const response = await user.agent
      .post('/direct-conversation')
      .send({ friendId: friend.userId })

    expect(response.statusCode).toBe(201)
    expect(response.body).toEqual({
      conversation: {
        id: expect.any(String),
        type: 'dm',
        name: null,
        createdById: user.userId,
        createdAt: expect.any(String),
      },
      member: {
        id: expect.any(String),
        conversationId: response.body.conversation.id,
        userId: user.userId,
        role: 'member',
        joinedAt: expect.any(String),
        lastReadMessageId: null,
      },
      isNewConversation: true,
    })

    const conversationOnDatabase = await prisma.conversation.findUnique({
      where: { id: response.body.conversation.id },
    })

    expect(conversationOnDatabase?.type).toEqual('DM')

    const membersOnDatabase = await prisma.conversationMember.findMany({
      where: { conversationId: response.body.conversation.id },
    })

    expect(membersOnDatabase.map((member) => member.userId).sort()).toEqual(
      [user.userId, friend.userId].sort()
    )
  })

  test('[POST] /direct-conversation returns the existing conversation on the second call', async () => {
    const { user, friend } = await createFriends({ accepted: true })

    const first = await user.agent
      .post('/direct-conversation')
      .send({ friendId: friend.userId })

    const second = await user.agent
      .post('/direct-conversation')
      .send({ friendId: friend.userId })

    expect(second.statusCode).toBe(201)
    expect(second.body.isNewConversation).toBe(false)
    expect(second.body.conversation.id).toBe(first.body.conversation.id)
    expect(second.body.member.id).toBe(first.body.member.id)

    const conversationsOnDatabase = await prisma.conversationMember.count({
      where: { conversationId: first.body.conversation.id },
    })

    expect(conversationsOnDatabase).toBe(2)
  })

  test('[POST] /direct-conversation opened by the friend reaches the same conversation', async () => {
    const { user, friend } = await createFriends({ accepted: true })

    const first = await user.agent
      .post('/direct-conversation')
      .send({ friendId: friend.userId })

    const second = await friend.agent
      .post('/direct-conversation')
      .send({ friendId: user.userId })

    expect(second.statusCode).toBe(201)
    expect(second.body.isNewConversation).toBe(false)
    expect(second.body.conversation.id).toBe(first.body.conversation.id)
    expect(second.body.member.userId).toBe(friend.userId)
  })

  test('[POST] /direct-conversation with simultaneous requests from both friends creates exactly one dm', async () => {
    const { user, friend } = await createFriends({ accepted: true })

    // sem a constraint do dm_key, os pedidos que não acham DM criariam uma
    // cada; com ela, quem perde a corrida recebe a DM do vencedor
    const responses = await Promise.all([
      ...Array.from({ length: 4 }, () =>
        user.agent
          .post('/direct-conversation')
          .send({ friendId: friend.userId })
      ),
      ...Array.from({ length: 4 }, () =>
        friend.agent
          .post('/direct-conversation')
          .send({ friendId: user.userId })
      ),
    ])

    expect(responses.every((response) => response.statusCode === 201)).toBe(
      true
    )

    // todos acabam na mesma conversa, e só um pedido a criou de fato
    expect(new Set(responses.map((r) => r.body.conversation.id)).size).toBe(1)
    expect(responses.filter((r) => r.body.isNewConversation)).toHaveLength(1)

    // cada um recebe o SEU membro
    responses.forEach((response, index) => {
      expect(response.body.member.userId).toBe(
        index < 4 ? user.userId : friend.userId
      )
    })

    const dmsOnDatabase = await prisma.conversation.count({
      where: {
        type: 'DM',
        conversationMembers: { some: { userId: user.userId } },
      },
    })

    expect(dmsOnDatabase).toBe(1)
  })

  test('[POST] /direct-conversation does not confuse a shared room with the dm', async () => {
    const { user, friend } = await createFriends({ accepted: true })

    const roomResponse = await user.agent
      .post('/room')
      .send({ name: 'team-zapwave' })

    await prisma.conversationMember.create({
      data: {
        conversationId: roomResponse.body.room.id,
        userId: friend.userId,
        role: 'MEMBER',
      },
    })

    const response = await user.agent
      .post('/direct-conversation')
      .send({ friendId: friend.userId })

    expect(response.statusCode).toBe(201)
    expect(response.body.isNewConversation).toBe(true)
    expect(response.body.conversation.type).toBe('dm')
    expect(response.body.conversation.id).not.toBe(roomResponse.body.room.id)
  })

  test('[POST] /direct-conversation without a token fails', async () => {
    const { friend } = await createFriends({ accepted: true })

    const response = await request(app.getHttpServer())
      .post('/direct-conversation')
      .send({ friendId: friend.userId })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /direct-conversation with an invalid body fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .post('/direct-conversation')
      .send({ friendId: 'not-an-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[POST] /direct-conversation with someone who is not a friend fails', async () => {
    const user = await createSession()
    const stranger = await createSession()

    const response = await user.agent
      .post('/direct-conversation')
      .send({ friendId: stranger.userId })

    expect(response.statusCode).toBe(404)
  })

  test('[POST] /direct-conversation with an unknown user fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .post('/direct-conversation')
      .send({ friendId: faker.string.uuid() })

    expect(response.statusCode).toBe(404)
  })

  test('[POST] /direct-conversation with a pending friendship fails', async () => {
    const { user, friend } = await createFriends({ accepted: false })

    const response = await user.agent
      .post('/direct-conversation')
      .send({ friendId: friend.userId })

    expect(response.statusCode).toBe(406)

    const conversationsOnDatabase = await prisma.conversation.count({
      where: { createdById: user.userId, type: 'DM' },
    })

    expect(conversationsOnDatabase).toBe(0)
  })

  test('[POST] /direct-conversation with yourself fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .post('/direct-conversation')
      .send({ friendId: user.userId })

    expect(response.statusCode).toBe(401)
  })
})
