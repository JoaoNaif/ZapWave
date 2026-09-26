import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { WsAdapter } from '@nestjs/platform-ws'
import request from 'supertest'
import cookieParser from 'cookie-parser'
import { faker } from '@faker-js/faker'
import { AppModule } from '@/infra/app.module'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

// Prova que as ações da API realmente geram notificação (antes de existir o
// NotificationModule, os subscribers nunca eram instanciados e nada era criado).
describe('Notification events (e2e)', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    app.useWebSocketAdapter(new WsAdapter(app))
    app.use(cookieParser())

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

  // a notificação é criada logo DEPOIS da resposta HTTP (o evento dispara
  // sem ninguém esperar), então espera aparecer
  async function waitForNotifications(
    session: Session,
    expectedTitles: string[]
  ) {
    const start = Date.now()
    let titles: string[] = []

    while (Date.now() - start < 5000) {
      const response = await session.agent.get('/notifications')
      titles = response.body.notifications.map(
        (n: { title: string }) => n.title
      )

      if (expectedTitles.every((title) => titles.includes(title))) break

      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    return titles
  }

  test('a friend request notifies the recipient', async () => {
    const sender = await createSession()
    const recipient = await createSession()

    await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    const titles = await waitForNotifications(recipient, [
      'Novo pedido de amizade',
    ])

    expect(titles).toContain('Novo pedido de amizade')
  })

  test('accepting a friend request notifies the sender', async () => {
    const sender = await createSession()
    const recipient = await createSession()

    const invite = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    await recipient.agent
      .put('/invite-friendship-accept')
      .send({ friendshipId: invite.body.friendship.id })

    const titles = await waitForNotifications(sender, [
      'Pedido de amizade aceito',
    ])

    expect(titles).toContain('Pedido de amizade aceito')
  })

  test('a room invite notifies the invitee, and accepting it notifies the inviter', async () => {
    const owner = await createSession()
    const invitee = await createSession()

    const room = await owner.agent.post('/room').send({ name: 'notifications' })

    const invite = await owner.agent.post('/room-invite').send({
      conversationId: room.body.room.id,
      recipientId: invitee.userId,
    })

    expect(
      await waitForNotifications(invitee, ['Novo convite de sala'])
    ).toContain('Novo convite de sala')

    await invitee.agent
      .post('/room-invite-accept')
      .send({ inviteId: invite.body.invite.id })

    expect(
      await waitForNotifications(owner, ['Convite de sala aceito'])
    ).toContain('Convite de sala aceito')
  })

  test('declining a friend request does not notify anyone', async () => {
    const sender = await createSession()
    const recipient = await createSession()

    const invite = await sender.agent
      .post('/invite-friendship')
      .send({ recipientId: recipient.userId })

    await recipient.agent
      .put('/invite-friendship-decline')
      .send({ friendshipId: invite.body.friendship.id })

    // dá tempo de uma notificação indevida aparecer
    await new Promise((resolve) => setTimeout(resolve, 300))
    const response = await sender.agent.get('/notifications')

    expect(response.body.notifications).toHaveLength(0)
  })
})
