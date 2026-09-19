import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Accept Room Invite (e2e)', () => {
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

  async function createPendingInvite() {
    const owner = await createSession()
    const recipient = await createSession()

    const roomResponse = await owner.agent
      .post('/room')
      .send({ name: 'team-zapwave' })

    const roomId = roomResponse.body.room.id as string

    const inviteResponse = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    return {
      owner,
      recipient,
      roomId,
      inviteId: inviteResponse.body.invite.id as string,
    }
  }

  test('[POST] /room-invite-accept', async () => {
    const { owner, recipient, roomId, inviteId } = await createPendingInvite()

    const response = await recipient.agent
      .post('/room-invite-accept')
      .send({ inviteId })

    expect(response.statusCode).toBe(201)
    expect(response.body).toEqual({
      invite: {
        id: inviteId,
        roomId,
        inviterId: owner.userId,
        inviteeId: recipient.userId,
        status: 'accepted',
        createdAt: expect.any(String),
        respondedAt: expect.any(String),
      },
      room: {
        id: roomId,
        name: 'team-zapwave',
        type: 'room',
        createdById: owner.userId,
        createdAt: expect.any(String),
      },
      member: {
        id: expect.any(String),
        roomId,
        userId: recipient.userId,
        role: 'member',
        joinedAt: expect.any(String),
        lastReadMessageId: null,
      },
    })

    const inviteOnDatabase = await prisma.roomInvite.findUnique({
      where: { id: inviteId },
    })

    expect(inviteOnDatabase?.status).toEqual('ACCEPTED')
    expect(inviteOnDatabase?.respondedAt).not.toBeNull()

    const memberOnDatabase = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: roomId,
          userId: recipient.userId,
        },
      },
    })

    expect(memberOnDatabase?.role).toEqual('MEMBER')
  })

  test('[POST] /room-invite-accept without a token fails', async () => {
    const { inviteId } = await createPendingInvite()

    const response = await request(app.getHttpServer())
      .post('/room-invite-accept')
      .send({ inviteId })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /room-invite-accept with an invalid body fails', async () => {
    const { recipient } = await createPendingInvite()

    const response = await recipient.agent
      .post('/room-invite-accept')
      .send({ inviteId: 'not-an-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[POST] /room-invite-accept on an unknown invite fails', async () => {
    const { recipient } = await createPendingInvite()

    const response = await recipient.agent
      .post('/room-invite-accept')
      .send({ inviteId: faker.string.uuid() })

    expect(response.statusCode).toBe(404)
  })

  test('[POST] /room-invite-accept by a user who was not invited fails', async () => {
    const { roomId, inviteId } = await createPendingInvite()
    const outsider = await createSession()

    const response = await outsider.agent
      .post('/room-invite-accept')
      .send({ inviteId })

    expect(response.statusCode).toBe(401)

    const inviteOnDatabase = await prisma.roomInvite.findUnique({
      where: { id: inviteId },
    })

    expect(inviteOnDatabase?.status).toEqual('PENDING')

    const membersOnDatabase = await prisma.conversationMember.count({
      where: { conversationId: roomId },
    })

    expect(membersOnDatabase).toBe(1)
  })

  test('[POST] /room-invite-accept by the inviter fails', async () => {
    const { owner, inviteId } = await createPendingInvite()

    const response = await owner.agent
      .post('/room-invite-accept')
      .send({ inviteId })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /room-invite-accept on an invite that is not pending fails', async () => {
    const { recipient, roomId, inviteId } = await createPendingInvite()

    await prisma.roomInvite.update({
      where: { id: inviteId },
      data: { status: 'REVOKED' },
    })

    const response = await recipient.agent
      .post('/room-invite-accept')
      .send({ inviteId })

    expect(response.statusCode).toBe(401)

    const membersOnDatabase = await prisma.conversationMember.count({
      where: { conversationId: roomId },
    })

    expect(membersOnDatabase).toBe(1)
  })

  test('[POST] /room-invite-accept on an already accepted invite fails', async () => {
    const { recipient, inviteId } = await createPendingInvite()

    await recipient.agent.post('/room-invite-accept').send({ inviteId })

    const response = await recipient.agent
      .post('/room-invite-accept')
      .send({ inviteId })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /room-invite-accept when the user is already a member fails', async () => {
    const { recipient, roomId, inviteId } = await createPendingInvite()

    await prisma.conversationMember.create({
      data: {
        conversationId: roomId,
        userId: recipient.userId,
        role: 'MEMBER',
      },
    })

    const response = await recipient.agent
      .post('/room-invite-accept')
      .send({ inviteId })

    expect(response.statusCode).toBe(409)

    const inviteOnDatabase = await prisma.roomInvite.findUnique({
      where: { id: inviteId },
    })

    expect(inviteOnDatabase?.status).toEqual('PENDING')
  })
})
