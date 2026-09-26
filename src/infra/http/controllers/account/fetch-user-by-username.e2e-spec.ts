import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch User By Username (e2e)', () => {
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

  async function createSession(overrides?: { username?: string }) {
    const email = faker.internet.email()
    const username = overrides?.username ?? faker.internet.username()
    const password = '123456'

    const registerResponse = await request(app.getHttpServer())
      .post('/register')
      .send({
        username,
        displayName: 'Fulano de Tal',
        email,
        password,
      })

    const agent = request.agent(app.getHttpServer())

    await agent
      .post('/sessions')
      .send({ email, password, deviceName: 'Chrome no Windows' })

    return {
      agent,
      email,
      username,
      userId: registerResponse.body.user.id as string,
    }
  }

  test('[GET] /users/:username', async () => {
    const searcher = await createSession()
    const target = await createSession()

    const response = await searcher.agent.get(`/users/${target.username}`)

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      user: {
        id: target.userId,
        username: target.username,
        displayName: 'Fulano de Tal',
      },
    })
  })

  test('[GET] /users/:username never exposes private fields', async () => {
    const searcher = await createSession()
    const target = await createSession()

    const response = await searcher.agent.get(`/users/${target.username}`)

    expect(response.body.user).not.toHaveProperty('email')
    expect(response.body.user).not.toHaveProperty('passwordHash')
    expect(JSON.stringify(response.body)).not.toContain(target.email)
  })

  test('[GET] /users/:username returns an id that works to send a friend invite', async () => {
    const searcher = await createSession()
    const target = await createSession()

    const found = await searcher.agent.get(`/users/${target.username}`)

    const invite = await searcher.agent
      .post('/invite-friendship')
      .send({ recipientId: found.body.user.id })

    expect(invite.statusCode).toBe(201)
  })

  test('[GET] /users/:username with a partial username finds nothing', async () => {
    const searcher = await createSession()
    const target = await createSession({ username: 'joaozinho_e2e' })

    const response = await searcher.agent.get(
      `/users/${target.username.slice(0, 5)}`
    )

    expect(response.statusCode).toBe(404)
  })

  test('[GET] /users/:username with an unknown username fails', async () => {
    const searcher = await createSession()

    const response = await searcher.agent.get('/users/ninguem_com_esse_nome')

    expect(response.statusCode).toBe(404)
  })

  test('[GET] /users/:username without a cookie fails', async () => {
    const target = await createSession()

    const response = await request(app.getHttpServer()).get(
      `/users/${target.username}`
    )

    expect(response.statusCode).toBe(401)
  })
})
