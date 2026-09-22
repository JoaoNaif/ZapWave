import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Leave Room (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
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

  test('[DELETE] /room-leave', async () => {
    const { owner, roomId } = await createRoom()
    const member = await addMember(roomId, 'MEMBER')

    const response = await member.agent
      .delete('/room-leave')
      .send({ conversationId: roomId })

    expect(response.statusCode).toBe(204)
    expect(await findMember(roomId, member.userId)).toBeNull()
    expect(await findMember(roomId, owner.userId)).not.toBeNull()
  })

  test('[DELETE] /room-leave as an admin', async () => {
    const { roomId } = await createRoom()
    const admin = await addMember(roomId, 'ADMIN')

    const response = await admin.agent
      .delete('/room-leave')
      .send({ conversationId: roomId })

    expect(response.statusCode).toBe(204)
    expect(await findMember(roomId, admin.userId)).toBeNull()
  })

  test('[DELETE] /room-leave without a token fails', async () => {
    const { roomId } = await createRoom()

    const response = await request(app.getHttpServer())
      .delete('/room-leave')
      .send({ conversationId: roomId })

    expect(response.statusCode).toBe(401)
  })

  test('[DELETE] /room-leave with an invalid body fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .delete('/room-leave')
      .send({ conversationId: 'not-an-uuid' })

    expect(response.statusCode).toBe(400)
  })

  test('[DELETE] /room-leave on an unknown room fails', async () => {
    const user = await createSession()

    const response = await user.agent
      .delete('/room-leave')
      .send({ conversationId: faker.string.uuid() })

    expect(response.statusCode).toBe(404)
  })

  test('[DELETE] /room-leave by a user who is not a member fails', async () => {
    const { roomId } = await createRoom()
    const stranger = await createSession()

    const response = await stranger.agent
      .delete('/room-leave')
      .send({ conversationId: roomId })

    expect(response.statusCode).toBe(404)
  })

  test('[DELETE] /room-leave by the owner fails', async () => {
    const { owner, roomId } = await createRoom()

    const response = await owner.agent
      .delete('/room-leave')
      .send({ conversationId: roomId })

    expect(response.statusCode).toBe(401)
    expect(await findMember(roomId, owner.userId)).not.toBeNull()
  })

  test('[DELETE] /room-leave twice fails', async () => {
    const { roomId } = await createRoom()
    const member = await addMember(roomId, 'MEMBER')

    await member.agent.delete('/room-leave').send({ conversationId: roomId })

    const response = await member.agent
      .delete('/room-leave')
      .send({ conversationId: roomId })

    expect(response.statusCode).toBe(404)
  })
})
