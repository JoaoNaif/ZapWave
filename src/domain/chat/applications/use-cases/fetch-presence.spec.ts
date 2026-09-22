import { beforeEach, describe, expect, it } from 'vitest'
import { FetchPresenceUseCase } from './fetch-presence'
import { FakePresence } from 'test/gateways/fake-presence'

let fakePresence: FakePresence
let sut: FetchPresenceUseCase

describe('Fetch Presence', () => {
  beforeEach(() => {
    fakePresence = new FakePresence()
    sut = new FetchPresenceUseCase(fakePresence)
  })

  it('should report a user as online right after a heartbeat', async () => {
    await fakePresence.heartbeat('user-1')

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.presence).toEqual({
        userId: 'user-1',
        online: true,
        lastSeenAt: expect.any(Date),
      })
    }
  })

  it('should report a user who never had a heartbeat as offline with no lastSeenAt', async () => {
    const result = await sut.execute({ userId: 'ghost-user' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.presence).toEqual({
        userId: 'ghost-user',
        online: false,
        lastSeenAt: null,
      })
    }
  })

  it('should report offline but keep lastSeenAt once the heartbeat is old enough', async () => {
    await fakePresence.heartbeat('user-1')
    // negativo garante "expirado" mesmo que o heartbeat acima e a checagem
    // abaixo caiam no mesmo milissegundo (threshold 0 seria uma corrida)
    fakePresence.onlineThresholdMs = -1

    const result = await sut.execute({ userId: 'user-1' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.presence.online).toBe(false)
      expect(result.value.presence.lastSeenAt).toEqual(expect.any(Date))
    }
  })
})
