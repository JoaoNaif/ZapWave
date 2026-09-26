import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { faker } from '@faker-js/faker'
import WebSocket from 'ws'
import { AppModule } from '@/infra/app.module'
import { EnvService } from '@/infra/env/env.service'
import { configureApp } from '@/infra/setup-app'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'

type ServerFrame =
  | { type: 'message'; message: { id: string; body: string } }
  | { type: 'ack-result'; messageId: string; acknowledged: boolean }

describe('Chat Gateway (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let wsUrl: string
  const openSockets: WebSocket[] = []

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleRef.createNestApplication()
    configureApp(app)
    prisma = moduleRef.get(PrismaService)

    await app.init()
    await app.listen(0)

    wsUrl = (await app.getUrl()).replace('http', 'ws')
  })

  afterEach(() => {
    for (const socket of openSockets.splice(0)) {
      socket.close()
    }
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

    const cookie = sessionResponse.headers['set-cookie'][0].split(';')[0]

    return {
      agent,
      cookie,
      userId: registerResponse.body.user.id as string,
      deviceId: sessionResponse.body.device_id as string,
    }
  }

  async function createRoom(owner: Awaited<ReturnType<typeof createSession>>) {
    const response = await owner.agent
      .post('/room')
      .send({ name: 'gateway-e2e-room' })

    return response.body.room.id as string
  }

  function connect(cookie: string, deviceId: string) {
    const socket = new WebSocket(`${wsUrl}/ws?deviceId=${deviceId}`, {
      headers: { cookie },
    })
    openSockets.push(socket)

    const received: ServerFrame[] = []
    socket.on('message', (data) => {
      received.push(JSON.parse(data.toString()))
    })

    return { socket, received }
  }

  function sendAck(socket: WebSocket, messageId: string) {
    socket.send(JSON.stringify({ type: 'ack', messageId }))
  }

  function waitForOpen(socket: WebSocket) {
    return new Promise<void>((resolve, reject) => {
      socket.once('open', () => resolve())
      socket.once('error', reject)
    })
  }

  function waitForClose(socket: WebSocket) {
    return new Promise<number>((resolve) => {
      socket.once('close', (code) => resolve(code))
    })
  }

  async function waitUntil(
    check: () => boolean,
    { timeoutMs = 5000, intervalMs = 50 } = {}
  ) {
    const start = Date.now()
    while (!check()) {
      if (Date.now() - start > timeoutMs) {
        throw new Error('waitUntil: condição não satisfeita a tempo')
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs))
    }
  }

  test('closes with 4401 when there is no token', async () => {
    const owner = await createSession()
    const socket = new WebSocket(`${wsUrl}/ws?deviceId=${owner.deviceId}`)
    openSockets.push(socket)

    const code = await waitForClose(socket)

    expect(code).toBe(4401)
  })

  test('closes with 4401 when the deviceId does not belong to the authenticated user', async () => {
    const owner = await createSession()
    const intruder = await createSession()

    const socket = new WebSocket(
      `${wsUrl}/ws?deviceId=${owner.deviceId}`,
      { headers: { cookie: intruder.cookie } }
    )
    openSockets.push(socket)

    const code = await waitForClose(socket)

    expect(code).toBe(4401)
  })

  test('closes with 4401 when the device is revoked', async () => {
    const owner = await createSession()
    await owner.agent
      .put('/revoke-device')
      .send({ deviceId: owner.deviceId })

    const socket = new WebSocket(`${wsUrl}/ws?deviceId=${owner.deviceId}`, {
      headers: { cookie: owner.cookie },
    })
    openSockets.push(socket)

    const code = await waitForClose(socket)

    expect(code).toBe(4401)
  })

  test('closes with 4401 when the deviceId query param is missing', async () => {
    const owner = await createSession()
    const socket = new WebSocket(`${wsUrl}/ws`, {
      headers: { cookie: owner.cookie },
    })
    openSockets.push(socket)

    const code = await waitForClose(socket)

    expect(code).toBe(4401)
  })

  test('closes with 4401 when the browser Origin is not in CORS_ORIGINS, even with a valid session', async () => {
    const owner = await createSession()

    const socket = new WebSocket(`${wsUrl}/ws?deviceId=${owner.deviceId}`, {
      headers: { cookie: owner.cookie, origin: 'http://evil.example.com' },
    })
    openSockets.push(socket)

    const code = await waitForClose(socket)

    expect(code).toBe(4401)
  })

  test('accepts the connection when the browser Origin is in CORS_ORIGINS', async () => {
    const owner = await createSession()
    const [allowedOrigin] = app.get(EnvService).get('CORS_ORIGINS')

    const socket = new WebSocket(`${wsUrl}/ws?deviceId=${owner.deviceId}`, {
      headers: { cookie: owner.cookie, origin: allowedOrigin },
    })
    openSockets.push(socket)

    await waitForOpen(socket)

    expect(socket.readyState).toBe(WebSocket.OPEN)
  })

  test('delivers a message sent over HTTP to the connected device in real time', async () => {
    const owner = await createSession()
    const roomId = await createRoom(owner)

    const { socket, received } = connect(owner.cookie, owner.deviceId)
    await waitForOpen(socket)

    const messageResponse = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi via stream' })

    await waitUntil(() => received.length > 0)

    expect(received).toEqual([
      {
        type: 'message',
        message: expect.objectContaining({
          id: messageResponse.body.message.id,
          body: 'oi via stream',
        }),
      },
    ])
  })

  test('replays on reconnect only the messages not yet acknowledged', async () => {
    const owner = await createSession()
    const roomId = await createRoom(owner)

    const first = connect(owner.cookie, owner.deviceId)
    await waitForOpen(first.socket)

    const msg1 = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'primeira' })
    await waitUntil(() => first.received.length > 0)

    // confirma a primeira mensagem antes de desconectar
    await owner.agent.put('/message-ack').send({
      deviceId: owner.deviceId,
      messageId: msg1.body.message.id,
    })

    first.socket.close()
    await waitForClose(first.socket)

    // chega uma segunda mensagem com o device desconectado
    const msg2 = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'segunda' })

    const second = connect(owner.cookie, owner.deviceId)
    await waitForOpen(second.socket)

    await waitUntil(() => second.received.length > 0)
    // dá tempo de uma eventual (e indevida) segunda entrega chegar
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(second.received).toEqual([
      {
        type: 'message',
        message: expect.objectContaining({
          id: msg2.body.message.id,
          body: 'segunda',
        }),
      },
    ])
  })

  test('does not deliver a message to a device of a user outside the room', async () => {
    const owner = await createSession()
    const outsider = await createSession()
    const roomId = await createRoom(owner)

    const { socket, received } = connect(outsider.cookie, outsider.deviceId)
    await waitForOpen(socket)

    await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'não é pra você' })

    // não tem o que esperar chegar — só garante que nada chega
    await new Promise((resolve) => setTimeout(resolve, 300))

    expect(received).toHaveLength(0)
  })

  test('acking over the WS connection updates the device cursor and replies with ack-result', async () => {
    const owner = await createSession()
    const roomId = await createRoom(owner)

    const { socket, received } = connect(owner.cookie, owner.deviceId)
    await waitForOpen(socket)

    const messageResponse = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'oi' })
    await waitUntil(() => received.length > 0)

    sendAck(socket, messageResponse.body.message.id)
    await waitUntil(() => received.length > 1)

    expect(received[1]).toEqual({
      type: 'ack-result',
      messageId: messageResponse.body.message.id,
      acknowledged: true,
    })

    const device = await prisma.device.findUnique({
      where: { id: owner.deviceId },
    })

    expect(device?.resumeCursorId).toBe(messageResponse.body.message.id)
  })

  test('acking over the WS connection prevents the message from being replayed on reconnect', async () => {
    const owner = await createSession()
    const roomId = await createRoom(owner)

    const first = connect(owner.cookie, owner.deviceId)
    await waitForOpen(first.socket)

    const msg1 = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'primeira' })
    await waitUntil(() => first.received.length > 0)

    sendAck(first.socket, msg1.body.message.id)
    await waitUntil(() => first.received.length > 1)

    first.socket.close()
    await waitForClose(first.socket)

    const msg2 = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'segunda' })

    const second = connect(owner.cookie, owner.deviceId)
    await waitForOpen(second.socket)

    await waitUntil(() => second.received.length > 0)
    await new Promise((resolve) => setTimeout(resolve, 200))

    expect(second.received).toEqual([
      {
        type: 'message',
        message: expect.objectContaining({
          id: msg2.body.message.id,
          body: 'segunda',
        }),
      },
    ])
  })

  test('a malformed client frame is ignored instead of crashing the connection', async () => {
    const owner = await createSession()
    const roomId = await createRoom(owner)

    const { socket, received } = connect(owner.cookie, owner.deviceId)
    await waitForOpen(socket)

    socket.send('not json at all')
    socket.send(JSON.stringify({ type: 'not-ack' }))

    // a conexão continua viva e útil depois dos frames ruins
    const messageResponse = await owner.agent
      .post('/message')
      .send({ conversationId: roomId, body: 'ainda funciona' })
    await waitUntil(() => received.length > 0)

    expect(received).toEqual([
      {
        type: 'message',
        message: expect.objectContaining({ id: messageResponse.body.message.id }),
      },
    ])
  })

  test('connecting marks the device owner as online', async () => {
    const owner = await createSession()
    const observer = await createSession()

    const before = await observer.agent.get(`/presence/${owner.userId}`)
    expect(before.body.presence.online).toBe(false)

    const { socket } = connect(owner.cookie, owner.deviceId)
    await waitForOpen(socket)

    // waitForOpen só garante o handshake do lado do cliente — o heartbeat
    // inicial (fire-and-forget, dentro do handleConnection assíncrono do
    // servidor) pode terminar um instante depois; espera até refletir
    let online = false
    const start = Date.now()
    while (!online && Date.now() - start < 3000) {
      const response = await observer.agent.get(`/presence/${owner.userId}`)
      online = response.body.presence.online
      if (!online) await new Promise((resolve) => setTimeout(resolve, 50))
    }

    const after = await observer.agent.get(`/presence/${owner.userId}`)
    expect(after.body.presence).toEqual({
      userId: owner.userId,
      online: true,
      lastSeenAt: expect.any(String),
    })
  })
})
