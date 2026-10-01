import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Conversation Reads (e2e)', () => {
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

  test('[GET] /conversations/:id/reads', async () => {
    const owner = await createSession()
    const member = await createSession()

    const room = await owner.agent.post('/room').send({ name: 'leituras' })
    const roomId = room.body.room.id as string

    const invite = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: member.userId })
    await member.agent
      .post('/room-invite-accept')
      .send({ inviteId: invite.body.invite.id })

    const message = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'leu?' })
    const messageId = message.body.message.id as string

    await member.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId })

    // o dono vê até onde o membro leu, sem o próprio cursor
    const ownerView = await owner.agent.get(`/conversations/${roomId}/reads`)

    expect(ownerView.statusCode).toBe(200)
    expect(ownerView.body).toEqual({
      reads: [{ userId: member.userId, lastReadMessageId: messageId }],
    })

    // o dono nunca marcou nada: null
    const memberView = await member.agent.get(`/conversations/${roomId}/reads`)

    expect(memberView.body).toEqual({
      reads: [{ userId: owner.userId, lastReadMessageId: null }],
    })
  })

  test('[GET] /conversations/:id/reads of a conversation the user is not in', async () => {
    const owner = await createSession()
    const stranger = await createSession()

    const room = await owner.agent.post('/room').send({ name: 'fechada' })

    const response = await stranger.agent.get(
      `/conversations/${room.body.room.id}/reads`
    )

    expect(response.statusCode).toBe(404)
  })
})
