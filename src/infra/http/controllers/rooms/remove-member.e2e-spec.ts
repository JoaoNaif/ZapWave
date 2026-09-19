import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Remove Member (e2e)', () => {
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

  async function createRoom() {
    const owner = await createSession()

    const response = await owner.agent
      .post('/room')
      .send({ name: 'team-zapwave' })

    return { owner, roomId: response.body.room.id as string }
  }

  async function addMember(roomId: string, role: 'MEMBER' | 'ADMIN') {
    const member = await createSession()

    await prisma.conversationMember.create({
      data: { conversationId: roomId, userId: member.userId, role },
    })

    return member
  }

  function findMember(roomId: string, userId: string) {
    return prisma.conversationMember.findUnique({
      where: { conversationId_userId: { conversationId: roomId, userId } },
    })
  }

  test('[DELETE] /room-remove-member as the owner', async () => {
    const { owner, roomId } = await createRoom()
    const member = await addMember(roomId, 'MEMBER')

    const response = await owner.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: member.userId,
    })

    expect(response.statusCode).toBe(204)
    expect(await findMember(roomId, member.userId)).toBeNull()
    expect(await findMember(roomId, owner.userId)).not.toBeNull()
  })

  test('[DELETE] /room-remove-member as the owner removing an admin', async () => {
    const { owner, roomId } = await createRoom()
    const admin = await addMember(roomId, 'ADMIN')

    const response = await owner.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: admin.userId,
    })

    expect(response.statusCode).toBe(204)
    expect(await findMember(roomId, admin.userId)).toBeNull()
  })

  test('[DELETE] /room-remove-member as an admin removing a member', async () => {
    const { roomId } = await createRoom()
    const admin = await addMember(roomId, 'ADMIN')
    const member = await addMember(roomId, 'MEMBER')

    const response = await admin.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: member.userId,
    })

    expect(response.statusCode).toBe(204)
    expect(await findMember(roomId, member.userId)).toBeNull()
  })

  test('[DELETE] /room-remove-member without a token fails', async () => {
    const { roomId } = await createRoom()
    const member = await addMember(roomId, 'MEMBER')

    const response = await request(app.getHttpServer())
      .delete('/room-remove-member')
      .send({ conversationId: roomId, targetUserId: member.userId })

    expect(response.statusCode).toBe(401)
    expect(await findMember(roomId, member.userId)).not.toBeNull()
  })

  test('[DELETE] /room-remove-member with an invalid body fails', async () => {
    const { owner } = await createRoom()

    const response = await owner.agent
      .delete('/room-remove-member')
      .send({ conversationId: 'not-an-uuid', targetUserId: 'not-an-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[DELETE] /room-remove-member on an unknown room fails', async () => {
    const owner = await createSession()
    const target = await createSession()

    const response = await owner.agent.delete('/room-remove-member').send({
      conversationId: faker.string.uuid(),
      targetUserId: target.userId,
    })

    expect(response.statusCode).toBe(404)
  })

  test('[DELETE] /room-remove-member by a user who is not a member fails', async () => {
    const { roomId } = await createRoom()
    const member = await addMember(roomId, 'MEMBER')
    const stranger = await createSession()

    const response = await stranger.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: member.userId,
    })

    expect(response.statusCode).toBe(404)
    expect(await findMember(roomId, member.userId)).not.toBeNull()
  })

  test('[DELETE] /room-remove-member on a user who is not a member fails', async () => {
    const { owner, roomId } = await createRoom()
    const stranger = await createSession()

    const response = await owner.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: stranger.userId,
    })

    expect(response.statusCode).toBe(404)
  })

  test('[DELETE] /room-remove-member by a regular member fails', async () => {
    const { roomId } = await createRoom()
    const actor = await addMember(roomId, 'MEMBER')
    const target = await addMember(roomId, 'MEMBER')

    const response = await actor.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: target.userId,
    })

    expect(response.statusCode).toBe(401)
    expect(await findMember(roomId, target.userId)).not.toBeNull()
  })

  test('[DELETE] /room-remove-member by an admin on another admin fails', async () => {
    const { roomId } = await createRoom()
    const actor = await addMember(roomId, 'ADMIN')
    const target = await addMember(roomId, 'ADMIN')

    const response = await actor.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: target.userId,
    })

    expect(response.statusCode).toBe(401)
    expect(await findMember(roomId, target.userId)).not.toBeNull()
  })

  test('[DELETE] /room-remove-member on the owner fails', async () => {
    const { owner, roomId } = await createRoom()
    const admin = await addMember(roomId, 'ADMIN')

    const response = await admin.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: owner.userId,
    })

    expect(response.statusCode).toBe(401)
    expect(await findMember(roomId, owner.userId)).not.toBeNull()
  })

  test('[DELETE] /room-remove-member on yourself fails', async () => {
    const { owner, roomId } = await createRoom()

    const response = await owner.agent.delete('/room-remove-member').send({
      conversationId: roomId,
      targetUserId: owner.userId,
    })

    expect(response.statusCode).toBe(401)
    expect(await findMember(roomId, owner.userId)).not.toBeNull()
  })
})
