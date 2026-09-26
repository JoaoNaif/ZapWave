import { INestApplication } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { RedisService } from '@/infra/redis/redis.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Revoke Device (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let redis: RedisService
  let jwt: JwtService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    app.use(cookieParser())
    prisma = moduleRef.get(PrismaService)
    redis = moduleRef.get(RedisService)
    jwt = moduleRef.get(JwtService)

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

    return {
      ...(await login(email, password)),
      email,
      password,
      userId: registerResponse.body.user.id as string,
    }
  }

  // cada login cria um device novo — é assim que o mesmo usuário tem 2 sessões
  async function login(email: string, password: string) {
    const agent = request.agent(app.getHttpServer())

    const authResponse = await agent
      .post('/sessions')
      .send({ email, password, deviceName: 'Chrome no Windows' })

    return {
      agent,
      deviceId: authResponse.body.device_id as string,
    }
  }

  // qualquer rota que exija login serve; esta é leve e não depende de dados
  const callProtectedRoute = (agent: ReturnType<typeof request.agent>) =>
    agent.get('/notifications')

  test('[PUT] /revoke-device', async () => {
    const { agent, deviceId } = await createSession()

    const response = await agent.put('/revoke-device').send({ deviceId })

    expect(response.statusCode).toBe(204)

    const deviceOnDatabase = await prisma.device.findUnique({
      where: { id: deviceId },
    })

    expect(deviceOnDatabase?.revokedAt).not.toBeNull()
  })

  test('a revoked device can no longer use the API with its own cookie', async () => {
    const { agent, deviceId } = await createSession()

    expect((await callProtectedRoute(agent)).statusCode).toBe(200)

    await agent.put('/revoke-device').send({ deviceId })

    expect((await callProtectedRoute(agent)).statusCode).toBe(401)
  })

  test('revoking one device keeps the other sessions of the same user working', async () => {
    const first = await createSession()
    const second = await login(first.email, first.password)

    expect((await callProtectedRoute(second.agent)).statusCode).toBe(200)

    await first.agent.put('/revoke-device').send({ deviceId: first.deviceId })

    expect((await callProtectedRoute(first.agent)).statusCode).toBe(401)
    expect((await callProtectedRoute(second.agent)).statusCode).toBe(200)
  })

  test('a device can revoke another device of the same user', async () => {
    const first = await createSession()
    const second = await login(first.email, first.password)

    await first.agent.put('/revoke-device').send({ deviceId: second.deviceId })

    expect((await callProtectedRoute(second.agent)).statusCode).toBe(401)
    expect((await callProtectedRoute(first.agent)).statusCode).toBe(200)
  })

  test('the session state is cached in Redis and flips to revoked on revoke', async () => {
    const { agent, deviceId } = await createSession()
    const key = `device-session:${deviceId}`

    await callProtectedRoute(agent)
    expect(await redis.get(key)).toBe('active')

    await agent.put('/revoke-device').send({ deviceId })
    expect(await redis.get(key)).toBe('revoked')
  })

  test('falls back to Postgres when Redis has nothing cached for the device', async () => {
    const { agent, deviceId } = await createSession()

    // revoga direto no banco e nunca chamou uma rota autenticada: não há
    // nada no cache, então só o Postgres sabe que foi revogado
    await prisma.device.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    })
    await redis.del(`device-session:${deviceId}`)

    expect((await callProtectedRoute(agent)).statusCode).toBe(401)
  })

  test('rejects a valid token that does not carry a deviceId', async () => {
    const { userId } = await createSession()
    const legacyToken = await jwt.signAsync({ sub: userId })

    const response = await request(app.getHttpServer())
      .get('/notifications')
      .set('Authorization', `Bearer ${legacyToken}`)

    expect(response.statusCode).toBe(401)
  })

  // A repetição vem de outra sessão do usuário: se viesse do próprio device
  // revogado, o cookie dele já não passaria mais do login (401).
  test('[PUT] /revoke-device is idempotent', async () => {
    const first = await createSession()
    const second = await login(first.email, first.password)

    await second.agent.put('/revoke-device').send({ deviceId: first.deviceId })

    const response = await second.agent
      .put('/revoke-device')
      .send({ deviceId: first.deviceId })

    expect(response.statusCode).toBe(204)
  })

  test('[PUT] /revoke-device with the cookie of an already revoked device fails', async () => {
    const { agent, deviceId } = await createSession()

    await agent.put('/revoke-device').send({ deviceId })

    const response = await agent.put('/revoke-device').send({ deviceId })

    expect(response.statusCode).toBe(401)
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

    const response = await attacker.agent
      .put('/revoke-device')
      .send({ deviceId: owner.deviceId })

    expect(response.statusCode).toBe(401)

    const deviceOnDatabase = await prisma.device.findUnique({
      where: { id: owner.deviceId },
    })

    expect(deviceOnDatabase?.revokedAt).toBeNull()
  })

  test('[PUT] /revoke-device on an unknown device fails', async () => {
    const { agent } = await createSession()

    const response = await agent
      .put('/revoke-device')
      .send({ deviceId: faker.string.uuid() })

    expect(response.statusCode).toBe(404)
  })
})
