import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Friends (e2e)', () => {
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

  test('[GET] /friends', async () => {
    const user = await createSession()
    const bruno = await createSession('Bruno')
    const ana = await createSession('Ana')

    // um pedido enviado pelo usuário e um recebido: os dois viram amigos
    const sentId = await sendInvite(user, bruno)
    await bruno.agent
      .put('/invite-friendship-accept')
      .send({ friendshipId: sentId })

    const receivedId = await sendInvite(ana, user)
    await user.agent
      .put('/invite-friendship-accept')
      .send({ friendshipId: receivedId })

    const response = await user.agent.get('/friends')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      friends: [
        {
          id: ana.userId,
          username: ana.username,
          displayName: 'Ana',
          online: false,
        },
        {
          id: bruno.userId,
          username: bruno.username,
          displayName: 'Bruno',
          online: false,
        },
      ],
    })
  })

  test('[GET] /friends does not list pending invites', async () => {
    const user = await createSession()
    const other = await createSession()

    await sendInvite(user, other)

    const response = await user.agent.get('/friends')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ friends: [] })
  })

  test('[GET] /friends without a cookie fails', async () => {
    const response = await request(app.getHttpServer()).get('/friends')

    expect(response.statusCode).toBe(401)
  })
})
