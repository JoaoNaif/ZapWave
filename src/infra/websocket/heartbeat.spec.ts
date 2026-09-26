import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { FakePresence } from 'test/gateways/fake-presence'
import { PING_INTERVAL_MS, startHeartbeat } from './heartbeat'

function makeFakeSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number
    ping: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  }
  socket.readyState = WebSocket.OPEN
  socket.ping = vi.fn()
  socket.terminate = vi.fn()

  return socket
}

describe('Heartbeat', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should mark the user online right away, without waiting for the first ping', async () => {
    const presence = new FakePresence()
    const socket = makeFakeSocket()

    startHeartbeat(socket as unknown as WebSocket, presence, 'user-1')

    expect(await presence.isOnline('user-1')).toBe(true)
    expect(socket.ping).not.toHaveBeenCalled()
  })

  it('should ping on every interval and renew presence on every pong', async () => {
    const presence = new FakePresence()
    const heartbeatSpy = vi.spyOn(presence, 'heartbeat')
    const socket = makeFakeSocket()

    startHeartbeat(socket as unknown as WebSocket, presence, 'user-1')

    for (let i = 1; i <= 3; i++) {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)
      socket.emit('pong')
    }

    expect(socket.ping).toHaveBeenCalledTimes(3)
    // 1 no connect + 1 por pong
    expect(heartbeatSpy).toHaveBeenCalledTimes(4)
    expect(socket.terminate).not.toHaveBeenCalled()
  })

  it('should terminate a connection that never answers the ping', async () => {
    const socket = makeFakeSocket()

    startHeartbeat(socket as unknown as WebSocket, new FakePresence(), 'user-1')

    // 1º intervalo: manda o ping. Sem pong, no 2º a conexão é considerada morta.
    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)
    expect(socket.terminate).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)
    expect(socket.terminate).toHaveBeenCalledTimes(1)
  })

  it('should keep a connection alive as long as each ping is answered', async () => {
    const socket = makeFakeSocket()

    startHeartbeat(socket as unknown as WebSocket, new FakePresence(), 'user-1')

    for (let i = 0; i < 10; i++) {
      await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS)
      socket.emit('pong')
    }

    expect(socket.terminate).not.toHaveBeenCalled()
  })

  it('should stop pinging once the socket closes', async () => {
    const socket = makeFakeSocket()

    startHeartbeat(socket as unknown as WebSocket, new FakePresence(), 'user-1')
    socket.emit('close')

    await vi.advanceTimersByTimeAsync(PING_INTERVAL_MS * 5)

    expect(socket.ping).not.toHaveBeenCalled()
    expect(socket.terminate).not.toHaveBeenCalled()
  })
})
