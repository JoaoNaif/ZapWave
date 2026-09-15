import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Revoke Device (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    prisma = moduleRef.get(PrismaService)

    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  async function createSession() {
    const email = faker.internet.email()
    const password = '123456'

    await request(app.getHttpServer()).post('/register').send({
      username: faker.internet.username(),
      displayName: faker.person.fullName(),
      email,
      password,
    })

    const authResponse = await request(app.getHttpServer())
      .post('/session')
      .send({ email, password, deviceName: 'Chrome no Windows' })

    return {
      accessToken: authResponse.body.access_token as string,
      deviceId: authResponse.body.device_id as string,
    }
  }

  test('[PUT] /revoke-device', async () => {
    const { accessToken, deviceId } = await createSession()

    const response = await request(app.getHttpServer())
      .put('/revoke-device')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId })

    expect(response.statusCode).toBe(204)

    const deviceOnDatabase = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    expect(deviceOnDatabase?.revokedAt).not.toBeNull()
  })

  test('[PUT] /revoke-device is idempotent', async () => {
    const { accessToken, deviceId } = await createSession()

    await request(app.getHttpServer())
      .put('/revoke-device')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId })

    const response = await request(app.getHttpServer())
      .put('/revoke-device')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId })

    expect(response.statusCode).toBe(204)
  })

  test('[PUT] /revoke-device without a token fails', async () => {
    const { deviceId } = await createSession()

    const response = await request(app.getHttpServer())
      .put('/revoke-device')
      .send({ deviceId })

    expect(response.statusCode).toBe(401)
  })

  test('[PUT] /revoke-device on another user device fails', async () => {
    const owner = await createSession()
    const attacker = await createSession()

    const response = await request(app.getHttpServer())
      .put('/revoke-device')
      .set('Authorization', `Bearer ${attacker.accessToken}`)
      .send({ deviceId: owner.deviceId })

    expect(response.statusCode).toBe(401)

    const deviceOnDatabase = await prisma.device.findUnique({
      where: { id: owner.deviceId },
    })

    expect(deviceOnDatabase?.revokedAt).toBeNull()
  })

  test('[PUT] /revoke-device on an unknown device fails', async () => {
    const { accessToken } = await createSession()

    const response = await request(app.getHttpServer())
      .put('/revoke-device')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ deviceId: faker.string.uuid() })

    expect(response.statusCode).toBe(400)
  })
})
