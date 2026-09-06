import { beforeEach, describe, expect, it } from 'vitest'
import { AckMessageDeliveryUseCase } from './ack-message-delivery'
import { InMemoryDevicesRepository } from 'test/repositories/in-memory-devices-repository'
import { InMemoryMessageStream } from 'test/gateways/in-memory-message-stream'
import { makeDevice } from 'test/factories/make-device'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryDevicesRepository: InMemoryDevicesRepository
let inMemoryMessageStream: InMemoryMessageStream

let sut: AckMessageDeliveryUseCase

describe('Ack Message Delivery', () => {
  beforeEach(() => {
    inMemoryDevicesRepository = new InMemoryDevicesRepository()
    inMemoryMessageStream = new InMemoryMessageStream()

    sut = new AckMessageDeliveryUseCase(
      inMemoryDevicesRepository,
      inMemoryMessageStream
    )
  })

  it('should be able to acknowledge the first message when the device has no cursor yet', async () => {
    const device = makeDevice(
      { resumeCursorId: null },
      new UniqueEntityId('device-1')
    )
    await inMemoryDevicesRepository.create(device)

    const result = await sut.execute({
      deviceId: 'device-1',
      messageId: 'msg-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.acknowledged).toBe(true)
    }
    expect(device.resumeCursorId?.toString()).toBe('msg-1')
  })

  it('should advance the cursor when the acknowledged message is newer', async () => {
    const device = makeDevice(
      { resumeCursorId: new UniqueEntityId('msg-1') },
      new UniqueEntityId('device-1')
    )
    await inMemoryDevicesRepository.create(device)

    const result = await sut.execute({
      deviceId: 'device-1',
      messageId: 'msg-2',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.acknowledged).toBe(true)
    }
    expect(device.resumeCursorId?.toString()).toBe('msg-2')
  })

  it('should notify the message stream that the device acknowledged the message', async () => {
    const device = makeDevice(
      { resumeCursorId: null },
      new UniqueEntityId('device-1')
    )
    await inMemoryDevicesRepository.create(device)

    await sut.execute({ deviceId: 'device-1', messageId: 'msg-1' })

    expect(inMemoryMessageStream.acknowledged).toEqual([
      { deviceId: 'device-1', messageId: 'msg-1' },
    ])
  })

  it('should not regress the cursor when an out-of-order (older) ack arrives late', async () => {
    const device = makeDevice(
      { resumeCursorId: new UniqueEntityId('msg-3') },
      new UniqueEntityId('device-1')
    )
    await inMemoryDevicesRepository.create(device)

    const result = await sut.execute({
      deviceId: 'device-1',
      messageId: 'msg-2',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.acknowledged).toBe(false)
    }
    // cursor continua no mais recente, não regrediu
    expect(device.resumeCursorId?.toString()).toBe('msg-3')
    // nem chega a notificar o gateway pra um ack que foi ignorado
    expect(inMemoryMessageStream.acknowledged).toHaveLength(0)
  })

  it('should acknowledge again when the same message is acked twice', async () => {
    const device = makeDevice(
      { resumeCursorId: new UniqueEntityId('msg-1') },
      new UniqueEntityId('device-1')
    )
    await inMemoryDevicesRepository.create(device)

    const result = await sut.execute({
      deviceId: 'device-1',
      messageId: 'msg-1',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.acknowledged).toBe(true)
    }
  })

  it('should not be able to acknowledge a message for a device that does not exist', async () => {
    const result = await sut.execute({
      deviceId: 'ghost-device',
      messageId: 'msg-1',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
    expect(inMemoryMessageStream.acknowledged).toHaveLength(0)
  })
})
