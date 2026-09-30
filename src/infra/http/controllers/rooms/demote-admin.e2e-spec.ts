import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Demote Admin (e2e)', () => {
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

  // sala com um admin (promovido pelo owner) e um member comum
  async function createRoomWithAdmin() {
    const owner = await createSession()
    const admin = await createSession()
    const other = await createSession()

    const room = await owner.agent.post('/room').send({ name: 'team-zapwave' })
    const roomId = room.body.room.id as string

    await addToRoom(owner, admin, roomId)
    await addToRoom(owner, other, roomId)

    await owner.agent
      .put('/room-promote-admin')
      .send({ conversationId: roomId, targetUserId: admin.userId })

    return { owner, admin, other, roomId }
  }

  test('[PUT] /room-demote-admin', async () => {
    const { owner, admin, roomId } = await createRoomWithAdmin()

    const response = await owner.agent
      .put('/room-demote-admin')
      .send({ conversationId: roomId, targetUserId: admin.userId })

    expect(response.statusCode).toBe(204)

    const members = await owner.agent.get(`/rooms/${roomId}/members`)
    expect(members.body.members).toContainEqual(
      expect.objectContaining({ id: admin.userId, role: 'member' })
    )
  })

  test('[PUT] /room-demote-admin takes away the admin powers', async () => {
    const { owner, admin, other, roomId } = await createRoomWithAdmin()

    await owner.agent
      .put('/room-demote-admin')
      .send({ conversationId: roomId, targetUserId: admin.userId })

    const remove = await admin.agent
      .delete('/room-remove-member')
      .send({ conversationId: roomId, targetUserId: other.userId })

    expect(remove.statusCode).toBe(401)
  })

  test('[PUT] /room-demote-admin by an admin fails', async () => {
    const { owner, admin, other, roomId } = await createRoomWithAdmin()

    await owner.agent
      .put('/room-promote-admin')
      .send({ conversationId: roomId, targetUserId: other.userId })

    const response = await admin.agent
      .put('/room-demote-admin')
      .send({ conversationId: roomId, targetUserId: other.userId })

    expect(response.statusCode).toBe(401)
  })

  test('[PUT] /room-demote-admin on the owner fails', async () => {
    const { owner, roomId } = await createRoomWithAdmin()

    const response = await owner.agent
      .put('/room-demote-admin')
      .send({ conversationId: roomId, targetUserId: owner.userId })

    expect(response.statusCode).toBe(401)
  })

  test('[PUT] /room-demote-admin with an invalid body fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .put('/room-demote-admin')
      .send({ conversationId: 'not-a-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[PUT] /room-demote-admin without a cookie fails', async () => {
    const response = await request(app.getHttpServer())
      .put('/room-demote-admin')
      .send({
        conversationId: faker.string.uuid(),
        targetUserId: faker.string.uuid(),
      })

    expect(response.statusCode).toBe(401)
  })
})
