import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Decline Friend Invite (e2e)', () => {
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

  async function createPendingFriendship() {
    const sender = await createSession()
    const recipient = await createSession()

    const inviteResponse = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    return {
      sender,
      recipient,
      friendshipId: inviteResponse.body.friendship.id as string,
    }
  }

  test('[PUT] /invite-friendship-decline', async () => {
    const { recipient, friendshipId } = await createPendingFriendship()

    const response = await recipient.agent
      .put('/invite-friendship-decline')
      .send({ friendshipId })

    expect(response.statusCode).toBe(204)

    const friendshipOnDatabase = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    })

    expect(friendshipOnDatabase?.status).toEqual('REJECTED')
  })

  test('[PUT] /invite-friendship-decline without a token fails', async () => {
    const { friendshipId } = await createPendingFriendship()

    const response = await request(app.getHttpServer())
      .put('/invite-friendship-decline')
      .send({ friendshipId })

    expect(response.statusCode).toBe(401)
  })

  test('[PUT] /invite-friendship-decline by the sender fails', async () => {
    const { sender, friendshipId } = await createPendingFriendship()

    const response = await sender.agent
      .put('/invite-friendship-decline')
      .send({ friendshipId })

    expect(response.statusCode).toBe(401)

    const friendshipOnDatabase = await prisma.friendship.findUnique({
      where: { id: friendshipId },
    })

    expect(friendshipOnDatabase?.status).toEqual('PENDING')
  })

  test('[PUT] /invite-friendship-decline by an unrelated user fails', async () => {
    const { friendshipId } = await createPendingFriendship()
    const outsider = await createSession()

    const response = await outsider.agent
      .put('/invite-friendship-decline')
      .send({ friendshipId })

    expect(response.statusCode).toBe(401)
  })

  test('[PUT] /invite-friendship-decline on an unknown friendship fails', async () => {
    const { recipient } = await createPendingFriendship()

    const response = await recipient.agent
      .put('/invite-friendship-decline')
      .send({ friendshipId: faker.string.uuid() })

    expect(response.statusCode).toBe(404)
  })

  test('[PUT] /invite-friendship-decline on an already declined friendship fails', async () => {
    const { recipient, friendshipId } = await createPendingFriendship()

    await recipient.agent
      .put('/invite-friendship-decline')
      .send({ friendshipId })

    const response = await recipient.agent
      .put('/invite-friendship-decline')
      .send({ friendshipId })

    expect(response.statusCode).toBe(401)
  })
})
