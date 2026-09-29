import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch Room Invites (e2e)', () => {
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

  async function inviteToNewRoom(
    owner: Awaited<ReturnType<typeof createSession>>,
    invitee: Awaited<ReturnType<typeof createSession>>,
    name: string
  ) {
    const room = await owner.agent.post('/room').send({ name })
    const roomId = room.body.room.id as string

    const invite = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: invitee.userId })

    return { roomId, inviteId: invite.body.invite.id as string }
  }

  test('[GET] /room-invites', async () => {
    const user = await createSession()
    const ana = await createSession('Ana')
    const bruno = await createSession('Bruno')

    const fromAna = await inviteToNewRoom(ana, user, 'team-zapwave')
    const fromBruno = await inviteToNewRoom(bruno, user, 'familia')

    const response = await user.agent.get('/room-invites')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({
      roomInvites: [
        {
          inviteId: fromBruno.inviteId,
          room: { id: fromBruno.roomId, name: 'familia' },
          inviter: {
            id: bruno.userId,
            username: bruno.username,
            displayName: 'Bruno',
          },
          createdAt: expect.any(String),
        },
        {
          inviteId: fromAna.inviteId,
          room: { id: fromAna.roomId, name: 'team-zapwave' },
          inviter: {
            id: ana.userId,
            username: ana.username,
            displayName: 'Ana',
          },
          createdAt: expect.any(String),
        },
      ],
    })
  })

  test('[GET] /room-invites returns an id that works to accept the invite', async () => {
    const user = await createSession()
    const owner = await createSession()

    const { roomId } = await inviteToNewRoom(owner, user, 'team-zapwave')

    const listed = await user.agent.get('/room-invites')

    const accept = await user.agent
      .post('/room-invite-accept')
      .send({ inviteId: listed.body.roomInvites[0].inviteId })

    expect(accept.statusCode).toBe(201)

    const afterAccept = await user.agent.get('/room-invites')
    expect(afterAccept.body).toEqual({ roomInvites: [] })

    // e o grupo passa a aparecer em "meus grupos"
    const rooms = await user.agent.get('/rooms')
    expect(rooms.body.rooms).toEqual([
      expect.objectContaining({ id: roomId, role: 'member' }),
    ])
  })

  test('[GET] /room-invites does not list invites the user sent', async () => {
    const user = await createSession()
    const other = await createSession()

    await inviteToNewRoom(user, other, 'team-zapwave')

    const response = await user.agent.get('/room-invites')

    expect(response.statusCode).toBe(200)
    expect(response.body).toEqual({ roomInvites: [] })
  })

  test('[GET] /room-invites without a cookie fails', async () => {
    const response = await request(app.getHttpServer()).get('/room-invites')

    expect(response.statusCode).toBe(401)
  })
})
