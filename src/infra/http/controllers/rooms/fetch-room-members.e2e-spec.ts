import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Room Members (e2e)', () => {
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

  async function createRoomWithMember() {
    const owner = await createSession('Ana')
    const member = await createSession('Bruno')

    const room = await owner.agent.post('/room').send({ name: 'team-zapwave' })
    const roomId = room.body.room.id as string

    const invite = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: member.userId })
    await member.agent
      .post('/room-invite-accept')
      .send({ inviteId: invite.body.invite.id })

    return { owner, member, roomId }
  }

  test('[GET] /rooms/:id/members', async () => {
    const { owner, member, roomId } = await createRoomWithMember()

    const response = await member.agent.get(`/rooms/${roomId}/members`)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      members: [
        {
          id: owner.userId,
          username: owner.username,
          displayName: 'Ana',
          role: 'owner',
        },
        {
          id: member.userId,
          username: member.username,
          displayName: 'Bruno',
          role: 'member',
        },
      ],
    })
  })

  test('[GET] /rooms/:id/members ids match the senderId of room messages', async () => {
    const { member, roomId } = await createRoomWithMember()

    const sent = await member.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi grupo' })

    const response = await member.agent.get(`/rooms/${roomId}/members`)

    const ids = response.body.members.map((m: { id: string }) => m.id)
    expect(ids).toContain(sent.body.message.senderId)
  })

  test('[GET] /rooms/:id/members for a non-member fails', async () => {
    const { roomId } = await createRoomWithMember()
    const outsider = await createSession()

    const response = await outsider.agent.get(`/rooms/${roomId}/members`)

    expect(response.statusCode).toBe(404)
  })

  test('[GET] /rooms/:id/members with an invalid id fails', async () => {
    const user = await createSession()

    const response = await user.agent.get('/rooms/not-a-uuid/members')

    expect(response.statusCode).toBe(400)
  })

  test('[GET] /rooms/:id/members without a cookie fails', async () => {
    const response = await request(app.getHttpServer()).get(
      `/rooms/${faker.string.uuid()}/members`
    )

    expect(response.statusCode).toBe(401)
  })
})
