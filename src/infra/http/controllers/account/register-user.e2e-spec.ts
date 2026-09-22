import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Register User (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    prisma = moduleRef.get(PrismaService)

    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  test('[POST] /register', async () => {
    const email = faker.internet.email()

    const response = await request(app.getHttpServer()).post('/register').send({
      username: 'johndoe',
      displayName: 'John Doe',
      email,
      password: '123456',
    })

    expect(response.statusCode).toBe(201)
    expect(response.body).toEqual({
      user: expect.objectContaining({
        id: expect.any(String),
        username: 'johndoe',
        displayName: 'John Doe',
        email,
      }),
    })
    expect(response.body.user).not.toHaveProperty('passwordHash')
    expect(response.body.user).not.toHaveProperty('password')

    const userOnDatabase = await prisma.user.findUnique({
      where: { email },
    })

    expect(userOnDatabase).not.toBeNull()
    expect(userOnDatabase?.passwordHash).not.toEqual('123456')
  })

  test('[POST] /register with a duplicate email fails', async () => {
    const email = faker.internet.email()

    await request(app.getHttpServer()).post('/register').send({
      username: 'firstuser',
      displayName: 'First User',
      email,
      password: '123456',
    })

    const response = await request(app.getHttpServer()).post('/register').send({
      username: 'seconduser',
      displayName: 'Second User',
      email,
      password: '123456',
    })

    expect(response.statusCode).toBe(409)
  })

  test('[POST] /register with an invalid body fails', async () => {
    const response = await request(app.getHttpServer()).post('/register').send({
      username: 'johndoe',
      displayName: 'John Doe',
      email: 'not-an-email',
      password: '123',
    })

    expect(response.statusCode).toBe(400)
  })
})
