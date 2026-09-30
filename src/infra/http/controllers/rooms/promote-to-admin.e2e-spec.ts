import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Promote To Admin (e2e)', () => {
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

  type Session = Awaited<ReturnType<typeof createSession>>

  async function addToRoom(owner: Session, member: Session, roomId: string) {
    const invite = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: member.userId })

    await member.agent
      .post('/room-invite-accept')
      .send({ inviteId: invite.body.invite.id })
  }

  async function createRoomWithMembers() {
    const owner = await createSession()
    const member = await createSession()
    const other = await createSession()

    const room = await owner.agent.post('/room').send({ name: 'team-zapwave' })
    const roomId = room.body.room.id as string

    await addToRoom(owner, member, roomId)
    await addToRoom(owner, other, roomId)

    return { owner, member, other, roomId }
  }

  test('[PUT] /room-promote-admin', async () => {
    const { owner, member, roomId } = await createRoomWithMembers()

    const response = await owner.agent
      .put('/room-promote-admin')
      .send({ conversationId: roomId, targetUserId: member.userId })

    expect(response.statusCode).toBe(204)

    const members = await owner.agent.get(`/rooms/${roomId}/members`)
    expect(members.body.members).toContainEqual(
      expect.objectContaining({ id: member.userId, role: 'admin' })
    )

    const rooms = await member.agent.get('/rooms')
    expect(rooms.body.rooms).toEqual([
      expect.objectContaining({ id: roomId, role: 'admin' }),
    ])
  })

  test('[PUT] /room-promote-admin gives the admin powers: invite and remove members', async () => {
    const { owner, member, other, roomId } = await createRoomWithMembers()
    const newcomer = await createSession()

    await owner.agent
      .put('/room-promote-admin')
      .send({ conversationId: roomId, targetUserId: member.userId })

    const invite = await member.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: newcomer.userId })
    expect(invite.statusCode).toBe(201)

    const remove = await member.agent
      .delete('/room-remove-member')
      .send({ conversationId: roomId, targetUserId: other.userId })
    expect(remove.statusCode).toBe(204)
  })

  test('[PUT] /room-promote-admin by a non-owner fails', async () => {
    const { member, other, roomId } = await createRoomWithMembers()

    const response = await member.agent
      .put('/room-promote-admin')
      .send({ conversationId: roomId, targetUserId: other.userId })

    expect(response.statusCode).toBe(401)
  })

  test('[PUT] /room-promote-admin with a target outside the room fails', async () => {
    const { owner, roomId } = await createRoomWithMembers()
    const outsider = await createSession()

    const response = await owner.agent
      .put('/room-promote-admin')
      .send({ conversationId: roomId, targetUserId: outsider.userId })

    expect(response.statusCode).toBe(404)
  })

  test('[PUT] /room-promote-admin with an invalid body fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .put('/room-promote-admin')
      .send({ conversationId: 'not-a-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[PUT] /room-promote-admin without a cookie fails', async () => {
    const response = await request(app.getHttpServer())
      .put('/room-promote-admin')
      .send({
        conversationId: faker.string.uuid(),
        targetUserId: faker.string.uuid(),
      })

    expect(response.statusCode).toBe(401)
  })
})
