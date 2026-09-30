import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Decline Room Invite (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
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

    const room = await owner.agent.post('/room').send({ name: 'team-zapwave' })
    const roomId = room.body.room.id as string

    const invite = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: recipient.userId })

    return {
      owner,
      recipient,
      roomId,
      inviteId: invite.body.invite.id as string,
    }
  }

  test('[POST] /room-invite-decline', async () => {
    const { recipient, roomId, inviteId } = await createPendingInvite()

    const response = await recipient.agent
      .post('/room-invite-decline')
      .send({ inviteId })

    expect(response.statusCode).toBe(204)

    const inviteOnDatabase = await prisma.roomInvite.findUnique({
      where: { id: inviteId },
    })
    expect(inviteOnDatabase?.status).toBe('DECLINED')
    expect(inviteOnDatabase?.respondedAt).toBeInstanceOf(Date)

    // some da lista de convites e não vira membro
    const invites = await recipient.agent.get('/room-invites')
    expect(invites.body).toEqual({ roomInvites: [] })

    const member = await prisma.conversationMember.findFirst({
      where: { conversationId: roomId, userId: recipient.userId },
    })
    expect(member).toBeNull()
  })

  test('[POST] /room-invite-decline then accept fails', async () => {
    const { recipient, inviteId } = await createPendingInvite()

    await recipient.agent.post('/room-invite-decline').send({ inviteId })

    const accept = await recipient.agent
      .post('/room-invite-accept')
      .send({ inviteId })

    expect(accept.statusCode).toBe(401)
  })

  test('[POST] /room-invite-decline by someone else fails', async () => {
    const { owner, inviteId } = await createPendingInvite()

    const response = await owner.agent
      .post('/room-invite-decline')
      .send({ inviteId })

    expect(response.statusCode).toBe(401)
  })

  test('[POST] /room-invite-decline with an unknown invite fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .post('/room-invite-decline')
      .send({ inviteId: faker.string.uuid() })

    expect(response.statusCode).toBe(404)
  })

  test('[POST] /room-invite-decline with an invalid body fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .post('/room-invite-decline')
      .send({ inviteId: 'not-a-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[POST] /room-invite-decline without a cookie fails', async () => {
    const response = await request(app.getHttpServer())
      .post('/room-invite-decline')
      .send({ inviteId: faker.string.uuid() })

    expect(response.statusCode).toBe(401)
  })
})
