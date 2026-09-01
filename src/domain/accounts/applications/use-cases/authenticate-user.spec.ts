import { beforeEach, describe, expect, it } from 'vitest'
import { AuthenticateUserUseCase } from './authenticate-user'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { InMemoryDevicesRepository } from 'test/repositories/in-memory-devices-repository'
import { FakeHasher } from 'test/cryptography/fake-hasher'
import { FakeEncrypter } from 'test/cryptography/fake-encrypter'
import { makeUser } from 'test/factories/make-user'
import { WrongCredentialsError } from '../errors/wrong-credentials-error'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryUserRepository: InMemoryUserRepository
let inMemoryDevicesRepository: InMemoryDevicesRepository
let fakeHasher: FakeHasher
let encrypter: FakeEncrypter

let sut: AuthenticateUserUseCase

describe('Authenticate User', () => {
  beforeEach(() => {
    inMemoryUserRepository = new InMemoryUserRepository()
    inMemoryDevicesRepository = new InMemoryDevicesRepository()
    fakeHasher = new FakeHasher()
    encrypter = new FakeEncrypter()

    sut = new AuthenticateUserUseCase(
      inMemoryUserRepository,
      inMemoryDevicesRepository,
      fakeHasher,
      encrypter
    )
  })

  it('should be able to authenticate a user', async () => {
    const user = makeUser({
      email: 'johndoe@email.com',
      passwordHash: await fakeHasher.hash('123456'),
    })

    await inMemoryUserRepository.create(user)

    const result = await sut.execute({
      email: 'johndoe@email.com',
      password: '123456',
    })

    expect(result.isRight()).toBe(true)
    expect(result.value).toEqual({
      accessToken: expect.any(String),
      deviceId: expect.any(String),
    })
  })

  it('should register a device for the session on authentication', async () => {
    const user = makeUser({
      email: 'johndoe@email.com',
      passwordHash: await fakeHasher.hash('123456'),
    })

    await inMemoryUserRepository.create(user)

    const result = await sut.execute({
      email: 'johndoe@email.com',
      password: '123456',
      deviceName: 'Chrome no Windows',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryDevicesRepository.items).toHaveLength(1)

    const device = inMemoryDevicesRepository.items[0]
    expect(device.userId.toString()).toEqual(user.id.toString())
    expect(device.name).toEqual('Chrome no Windows')
    expect(device.isRevoked).toBe(false)

    if (result.isRight()) {
      expect(result.value.deviceId).toEqual(device.id.toString())
    }
  })

  it('should sign the token with the user id and the device id', async () => {
    const user = makeUser({
      email: 'johndoe@email.com',
      passwordHash: await fakeHasher.hash('123456'),
    })

    await inMemoryUserRepository.create(user)

    const result = await sut.execute({
      email: 'johndoe@email.com',
      password: '123456',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      // FakeEncrypter apenas serializa o payload em JSON
      expect(JSON.parse(result.value.accessToken)).toEqual({
        sub: user.id.toString(),
        deviceId: inMemoryDevicesRepository.items[0].id.toString(),
      })
    }
  })

  it('should not authenticate when the user does not exist', async () => {
    const result = await sut.execute({
      email: 'unknown@email.com',
      password: '123456',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
    expect(inMemoryDevicesRepository.items).toHaveLength(0)
  })

  it('should not authenticate with a wrong password', async () => {
    const user = makeUser({
      email: 'johndoe@email.com',
      passwordHash: await fakeHasher.hash('123456'),
    })

    await inMemoryUserRepository.create(user)

    const result = await sut.execute({
      email: 'johndoe@email.com',
      password: 'wrong-password',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(WrongCredentialsError)
    expect(inMemoryDevicesRepository.items).toHaveLength(0)
  })
})
