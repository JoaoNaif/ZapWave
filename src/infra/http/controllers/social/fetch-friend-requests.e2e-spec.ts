import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Friend Requests (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app)

    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  async function createSession(displayName = faker.person.fullName()) {
    const email = faker.internet.email()
    const username = faker.internet.username()
    const password = '123456'

    const registerResponse = await request(app.getHttpServer())
      .post('/register')
      .send({ username, displayName, email, password })

    const agent = request.agent(app.getHttpServer())

    await agent
      .post('/sessions')
      .send({ email, password, deviceName: 'Chrome no Windows' })

    return {
      agent,
      username,
      displayName,
      userId: registerResponse.body.user.id as string,
    }
  }

  async function sendInvite(
    sender: Awaited<ReturnType<typeof createSession>>,
    recipient: Awaited<ReturnType<typeof createSession>>
  ) {
    const response = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    return response.body.friendship.id as string
  }

  test('[GET] /friend-requests', async () => {
    const user = await createSession()
    const ana = await createSession('Ana')
    const bruno = await createSession('Bruno')

    const fromAna = await sendInvite(ana, user)
    const fromBruno = await sendInvite(bruno, user)

    const response = await user.agent.get('/friend-requests')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      friendRequests: [
        {
          friendshipId: fromBruno,
          sender: {
            id: bruno.userId,
            username: bruno.username,
            displayName: 'Bruno',
          },
          createdAt: expect.any(String),
        },
        {
          friendshipId: fromAna,
          sender: {
            id: ana.userId,
            username: ana.username,
            displayName: 'Ana',
          },
          createdAt: expect.any(String),
        },
      ],
    })
  })

  test('[GET] /friend-requests returns an id that works to accept the request', async () => {
    const user = await createSession()
    const other = await createSession()

    await sendInvite(other, user)

    const listed = await user.agent.get('/friend-requests')

    const accept = await user.agent
      .put('/invite-friendship-accept')
      .send({ friendshipId: listed.body.friendRequests[0].friendshipId })

    expect(accept.statusCode).toBe(204)

    const afterAccept = await user.agent.get('/friend-requests')

    expect(afterAccept.body).toEqual({ friendRequests: [] })
  })

  test('[GET] /friend-requests does not list requests the user sent', async () => {
    const user = await createSession()
    const other = await createSession()

    await sendInvite(user, other)

    const response = await user.agent.get('/friend-requests')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ friendRequests: [] })
  })

  test('[GET] /friend-requests without a cookie fails', async () => {
    const response = await request(app.getHttpServer()).get('/friend-requests')

    expect(response.statusCode).toBe(401)
  })
})
