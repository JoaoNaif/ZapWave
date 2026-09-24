import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Invite To Room (e2e)', () => {
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

  async function createRoom() {
    const owner = await createSession()

    const response = await owner.agent
      .post('/room')
      .send({ name: 'team-zapwave' })

    return { owner, roomId: response.body.room.id as string }
  }

  test('[POST] /room-invite', async () => {
    const { owner, roomId } = await createRoom()
    const recipient = await createSession()

    const response = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    expect(response.statusCode).toBe(201)
    expect(response.body).toEqual({
      invite: {
        id: expect.any(String),
        roomId,
        inviterId: owner.userId,
        inviteeId: recipient.userId,
        status: 'pending',
        createdAt: expect.any(String),
        respondedAt: null,
      },
      room: {
        id: roomId,
        name: 'team-zapwave',
        type: 'room',
        createdById: owner.userId,
        createdAt: expect.any(String),
      },
      sender: {
        id: expect.any(String),
        roomId,
        userId: owner.userId,
        role: 'owner',
        joinedAt: expect.any(String),
        lastReadMessageId: null,
      },
    })

    const inviteOnDatabase = await prisma.roomInvite.findUnique({
      where: { id: response.body.invite.id },
    })

    expect(inviteOnDatabase).toEqual(
      expect.objectContaining({
        conversationId: roomId,
        inviterId: owner.userId,
        inviteeId: recipient.userId,
        status: 'PENDING',
        respondedAt: null,
      })
    )
  })

  test('[POST] /room-invite as an admin', async () => {
    const { roomId } = await createRoom()
    const admin = await createSession()
    const recipient = await createSession()

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: admin.userId, role: 'ADMIN' },
    })

    const response = await admin.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    expect(response.statusCode).toBe(201)
    expect(response.body.invite.inviterId).toBe(admin.userId)
    expect(response.body.sender.role).toBe('admin')
  })

  test('[POST] /room-invite without a token fails', async () => {
    const { roomId } = await createRoom()
    const recipient = await createSession()

    const response = await request(app.getHttpServer())
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /room-invite with an invalid body fails', async () => {
    const owner = await createSession()

    const response = await owner.agent
      .post('/room-invite')
      .send({ conversationId: 'not-an-uuid', recipientId: 'not-an-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[POST] /room-invite on an unknown room fails', async () => {
    const owner = await createSession()
    const recipient = await createSession()

    const response = await owner.agent.post('/room-invite').send({
      conversationId: faker.string.uuid(),
      recipientId: recipient.userId,
    })

    expect(response.statusCode).toBe(404)
  })

  test('[POST] /room-invite by a user who is not a member fails', async () => {
    const { roomId } = await createRoom()
    const stranger = await createSession()
    const recipient = await createSession()

    const response = await stranger.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    expect(response.statusCode).toBe(404)

    const invitesOnDatabase = await prisma.roomInvite.count({
      where: { conversationId: roomId },
    })

    expect(invitesOnDatabase).toBe(0)
  })

  test('[POST] /room-invite by a regular member fails', async () => {
    const { roomId } = await createRoom()
    const member = await createSession()
    const recipient = await createSession()

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: member.userId, role: 'MEMBER' },
    })

    const response = await member.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    expect(response.statusCode).toBe(401)

    const invitesOnDatabase = await prisma.roomInvite.count({
      where: { conversationId: roomId },
    })

    expect(invitesOnDatabase).toBe(0)
  })

  test('[POST] /room-invite to a user who is already a member fails', async () => {
    const { owner, roomId } = await createRoom()
    const member = await createSession()

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: member.userId, role: 'MEMBER' },
    })

    const response = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: member.userId })

    expect(response.statusCode).toBe(409)
  })

  test('[POST] /room-invite with two simultaneous requests creates exactly one invite', async () => {
    const { owner, roomId } = await createRoom()
    const recipient = await createSession()
    const body = { conversationId: roomId, recipientId: recipient.userId }

    // sem a constraint única, os dois podem passar juntos pela checagem do
    // use-case; com ela, quem perde a corrida recebe 409 (e não um 500)
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        owner.agent.post('/room-invite').send(body)
      )
    )

    const statuses = responses.map((response) => response.statusCode).sort()
    expect(statuses).toEqual([201, 409, 409, 409, 409])

    const invitesOnDatabase = await prisma.roomInvite.count({
      where: { conversationId: roomId, inviteeId: recipient.userId },
    })

    expect(invitesOnDatabase).toBe(1)
  })

  test('[POST] /room-invite with an already existing invite fails', async () => {
    const { owner, roomId } = await createRoom()
    const recipient = await createSession()

    await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    const response = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    expect(response.statusCode).toBe(409)

    const invitesOnDatabase = await prisma.roomInvite.count({
      where: { conversationId: roomId, inviteeId: recipient.userId },
    })

    expect(invitesOnDatabase).toBe(1)
  })
})
