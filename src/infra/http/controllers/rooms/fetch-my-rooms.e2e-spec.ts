import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { configureApp } from '@/infra/setup-app'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

describe('Fetch My Rooms (e2e)', () => {
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

  async function createRoom(
    owner: Awaited<ReturnType<typeof createSession>>,
    name: string
  ) {
    const response = await owner.agent.post('/room').send({ name })

    return response.body.room.id as string
  }

  async function addToRoom(
    owner: Awaited<ReturnType<typeof createSession>>,
    member: Awaited<ReturnType<typeof createSession>>,
    roomId: string
  ) {
    const invite = await owner.agent
      .post('/room-invite')
      .send({ conversationId: roomId, recipientId: member.userId })

    await member.agent
      .post('/room-invite-accept')
      .send({ inviteId: invite.body.invite.id })
  }

  test('[GET] /rooms', async () => {
    const owner = await createSession()
    const member = await createSession()

    const roomId = await createRoom(owner, 'team-zapwave')
    await addToRoom(owner, member, roomId)

    const ownerView = await owner.agent.get('/rooms')

    expect(ownerView.statusCode).toBe(200)
    expect(ownerView.body).toEqual({
      rooms: [
        {
          id: roomId,
          name: 'team-zapwave',
          role: 'owner',
          memberCount: 2,
          lastMessageAt: null,
          lastMessage: null,
          unreadCount: 0,
        },
      ],
    })

    const memberView = await member.agent.get('/rooms')

    expect(memberView.body.rooms).toEqual([
      expect.objectContaining({ id: roomId, role: 'member', memberCount: 2 }),
    ])
  })

  test('[GET] /rooms orders by last activity and ignores direct conversations', async () => {
    const user = await createSession()
    const friend = await createSession()

    // DM com um amigo: não pode aparecer na lista de grupos
    const invite = await user.agent
      .post('/invite-friendship')
      .send({ recipientId: friend.userId })
    await friend.agent
      .put('/invite-friendship-accept')
      .send({ friendshipId: invite.body.friendship.id })
    await user.agent
      .post('/direct-conversation')
      .send({ friendId: friend.userId })

    const olderRoom = await createRoom(user, 'antiga')
    const newerRoom = await createRoom(user, 'nova')

    // a mais antiga recebe mensagem e passa pra frente
    await user.agent
      .post('/message')
      .send({ conversationId: olderRoom, body: 'oi grupo' })

    const response = await user.agent.get('/rooms')

    expect(response.statusCode).toBe(200)
    expect(response.body.rooms.map((room: { id: string }) => room.id)).toEqual([
      olderRoom,
      newerRoom,
    ])
    expect(response.body.rooms[0].lastMessageAt).toEqual(expect.any(String))
  })

  test('[GET] /rooms counts unread messages per member', async () => {
    const owner = await createSession()
    const member = await createSession()

    const roomId = await createRoom(owner, 'contagem')

    async function send(body: string) {
      const response = await owner.agent
        .post('/message')
        .send({ conversationId: roomId, body })

      return response.body.message.id as string
    }

    // mandada antes de o membro entrar: não conta pra ele
    await send('antes')
    await addToRoom(owner, member, roomId)
    const secondId = await send('depois 1')
    await send('depois 2')

    const beforeRead = await member.agent.get('/rooms')
    expect(beforeRead.body.rooms[0].unreadCount).toBe(2)
    expect(beforeRead.body.rooms[0].lastMessage).toEqual(
      expect.objectContaining({ senderId: owner.userId, body: 'depois 2' })
    )

    await member.agent
      .put('/mark-conversation')
      .send({ conversationId: roomId, messageId: secondId })

    const afterRead = await member.agent.get('/rooms')
    expect(afterRead.body.rooms[0].unreadCount).toBe(1)

    // o dono só mandou: nada a ler
    const ownerView = await owner.agent.get('/rooms')
    expect(ownerView.body.rooms[0].unreadCount).toBe(0)
  })

  test('[GET] /rooms without a cookie fails', async () => {
    const response = await request(app.getHttpServer()).get('/rooms')

    expect(response.statusCode).toBe(401)
  })
})
