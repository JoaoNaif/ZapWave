import { beforeEach, describe, expect, it } from 'vitest'
import { RevokeDeviceUseCase } from './revoke-device'
import { InMemoryDevicesRepository } from 'test/repositories/in-memory-devices-repository'
import { FakeSessionGateway } from 'test/gateways/fake-session-gateway'
import { makeDevice } from 'test/factories/make-device'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryDevicesRepository: InMemoryDevicesRepository
let fakeSessionGateway: FakeSessionGateway

let sut: RevokeDeviceUseCase

describe('Revoke Device', () => {
  beforeEach(() => {
    inMemoryDevicesRepository = new InMemoryDevicesRepository()
    fakeSessionGateway = new FakeSessionGateway()

    sut = new RevokeDeviceUseCase(inMemoryDevicesRepository, fakeSessionGateway)
  })

  it('should be able to revoke an own device', async () => {
    const device = makeDevice(
      { userId: new UniqueEntityId('user-1') },
      new UniqueEntityId('device-1')
    )

    await inMemoryDevicesRepository.create(device)

    const result = await sut.execute({
      userId: 'user-1',
      deviceId: 'device-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryDevicesRepository.items[0].isRevoked).toBe(true)
    expect(inMemoryDevicesRepository.items[0].revokedAt).toBeInstanceOf(Date)
  })

  it('should close the live session of the revoked device', async () => {
    const device = makeDevice(
      { userId: new UniqueEntityId('user-1') },
      new UniqueEntityId('device-1')
    )

    await inMemoryDevicesRepository.create(device)

    await sut.execute({ userId: 'user-1', deviceId: 'device-1' })

    expect(fakeSessionGateway.disconnected).toEqual(['device-1'])
  })

  it('should not be able to revoke a device that does not exist', async () => {
    const result = await sut.execute({
      userId: 'user-1',
      deviceId: 'ghost-device',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should not be able to revoke a device owned by another user', async () => {
    const device = makeDevice(
      { userId: new UniqueEntityId('user-1') },
      new UniqueEntityId('device-1')
    )

    await inMemoryDevicesRepository.create(device)

    const result = await sut.execute({
      userId: 'user-2',
      deviceId: 'device-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(NotAllowedError)
    expect(inMemoryDevicesRepository.items[0].isRevoked).toBe(false)
    expect(fakeSessionGateway.disconnected).toHaveLength(0)
  })

  it('should be idempotent when the device is already revoked', async () => {
    const device = makeDevice(
      {
        userId: new UniqueEntityId('user-1'),
        revokedAt: new Date('2026-01-01'),
      },
      new UniqueEntityId('device-1')
    )

    await inMemoryDevicesRepository.create(device)

    const result = await sut.execute({
      userId: 'user-1',
      deviceId: 'device-1',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryDevicesRepository.items[0].revokedAt).toEqual(
      new Date('2026-01-01')
    )
    expect(fakeSessionGateway.disconnected).toHaveLength(0)
  })
})
