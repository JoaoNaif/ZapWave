import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Ack Message Delivery (e2e)', () => {
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

    const sessionResponse = await agent
      .post('/sessions')
      .send({ email, password, deviceName: 'Chrome no Windows' })

    return {
      agent,
      userId: registerResponse.body.user.id as string,
      deviceId: sessionResponse.body.device_id as string,
    }
  }

  async function createRoomWithMessages(amount: number) {
    const owner = await createSession()

    const roomResponse = await owner.agent
      .post('/room')
      .send({ name: 'team-zapwave' })

    const roomId = roomResponse.body.room.id as string
    const messageIds: string[] = []

    for (let i = 1; i <= amount; i++) {
      const response = await owner.agent
        .post('/message')
        .send({ conversationId: roomId, body: `message ${i}` })

      messageIds.push(response.body.message.id)
    }

    return { owner, roomId, messageIds }
  }

  async function findResumeCursorId(deviceId: string) {
    const device = await prisma.device.findUnique({ where: { id: deviceId } })

    return device?.resumeCursorId
  }

  test('[PUT] /message-ack', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)

    const response = await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ acknowledged: true })
    expect(await findResumeCursorId(owner.deviceId)).toBe(messageIds[0])
  })

  test('[PUT] /message-ack advances the cursor to a newer message', async () => {
    const { owner, messageIds } = await createRoomWithMessages(2)

    await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    const response = await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[1] })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ acknowledged: true })
    expect(await findResumeCursorId(owner.deviceId)).toBe(messageIds[1])
  })

  test('[PUT] /message-ack does not regress the cursor to an older message', async () => {
    const { owner, messageIds } = await createRoomWithMessages(2)

    await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[1] })

    const response = await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ acknowledged: false })
    expect(await findResumeCursorId(owner.deviceId)).toBe(messageIds[1])
  })

  test('[PUT] /message-ack on the same message twice', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)

    await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    const response = await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ acknowledged: true })
  })

  test('deleting the acked message keeps the device and clears its cursor', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)

    await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    await prisma.message.delete({ where: { id: messageIds[0] } })

    const device = await prisma.device.findUnique({
      where: { id: owner.deviceId },
    })

    expect(device).not.toBeNull()
    expect(device?.resumeCursorId).toBeNull()
  })

  test('[PUT] /message-ack without a token fails', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)

    const response = await request(app.getHttpServer())
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(401)
    expect(await findResumeCursorId(owner.deviceId)).toBeNull()
  })

  test('[PUT] /message-ack with an invalid body fails', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)

    const invalidDevice = await owner.agent
      .put('/message-ack')
      .send({ deviceId: 'not-an-uuid', messageId: messageIds[0] })

    const invalidMessage = await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: 'not-an-ulid' })

    expect(invalidDevice.statusCode).toBe(400)
    expect(invalidMessage.statusCode).toBe(400)
  })

  test('[PUT] /message-ack on an unknown device fails', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)

    const response = await owner.agent
      .put('/message-ack')
      .send({ deviceId: faker.string.uuid(), messageId: messageIds[0] })

    expect(response.statusCode).toBe(404)
  })

  test('[PUT] /message-ack on a device of another user fails', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)
    const intruder = await createSession()

    const response = await intruder.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(401)
    expect(await findResumeCursorId(owner.deviceId)).toBeNull()
  })

  test('[PUT] /message-ack on a revoked device fails', async () => {
    const { owner, messageIds } = await createRoomWithMessages(1)

    await owner.agent.put('/revoke-device').send({ deviceId: owner.deviceId })

    const response = await owner.agent
      .put('/message-ack')
      .send({ deviceId: owner.deviceId, messageId: messageIds[0] })

    expect(response.statusCode).toBe(401)
    expect(await findResumeCursorId(owner.deviceId)).toBeNull()
  })
})
