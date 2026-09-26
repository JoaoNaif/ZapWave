import { EventEmitter } from 'node:events'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
import { ConnectionRegistry } from './connection-registry'

function makeFakeSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    close: ReturnType<typeof vi.fn>
  }
  // como o ws de verdade: close() inicia o fechamento e o evento 'close' vem depois
  socket.close = vi.fn(() => {
    queueMicrotask(() => socket.emit('close'))
  })

  return socket
}

const asWs = (socket: ReturnType<typeof makeFakeSocket>) =>
  socket as unknown as WebSocket

describe('Connection Registry', () => {
  let sut: ConnectionRegistry

  beforeEach(() => {
    sut = new ConnectionRegistry()
  })

  it('should close every socket of the given device with the given code', () => {
    const first = makeFakeSocket()
    const second = makeFakeSocket()
    sut.add('device-1', asWs(first))
    sut.add('device-1', asWs(second))

    sut.closeAll('device-1', 4401, 'revoked')

    expect(first.close).toHaveBeenCalledWith(4401, 'revoked')
    expect(second.close).toHaveBeenCalledWith(4401, 'revoked')
  })

  it('should not touch sockets of other devices', () => {
    const target = makeFakeSocket()
    const other = makeFakeSocket()
    sut.add('device-1', asWs(target))
    sut.add('device-2', asWs(other))

    sut.closeAll('device-1', 4401, 'revoked')

    expect(other.close).not.toHaveBeenCalled()
  })

  it('should do nothing when the device is not connected', () => {
    expect(() => sut.closeAll('nobody', 4401, 'revoked')).not.toThrow()
  })

  it('should forget a socket when it closes on its own', () => {
    const socket = makeFakeSocket()
    sut.add('device-1', asWs(socket))
    expect(sut.countFor('device-1')).toBe(1)

    socket.emit('close')

    expect(sut.countFor('device-1')).toBe(0)
  })

  it('should keep the other connections of the device when only one closes', () => {
    const first = makeFakeSocket()
    const second = makeFakeSocket()
    sut.add('device-1', asWs(first))
    sut.add('device-1', asWs(second))

    first.emit('close')

    expect(sut.countFor('device-1')).toBe(1)

    sut.closeAll('device-1', 4401, 'revoked')

    expect(second.close).toHaveBeenCalled()
    expect(first.close).not.toHaveBeenCalled()
  })

  it('should empty the device after closeAll once the sockets finish closing', async () => {
    const socket = makeFakeSocket()
    sut.add('device-1', asWs(socket))

    sut.closeAll('device-1', 4401, 'revoked')
    await Promise.resolve()

    expect(sut.countFor('device-1')).toBe(0)
  })
})
