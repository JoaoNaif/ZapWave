import { beforeEach, describe, expect, it } from 'vitest'
import { AuthenticateUserUseCase } from './authenticate-user'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { FakeHasher } from 'test/cryptography/fake-hasher'
import { FakeEncrypter } from 'test/cryptography/fake-encrypter'
import { makeUser } from 'test/factories/make-user'
import { WrongCredentialsError } from '../errors/wrong-credentials-error'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryUserRepository: InMemoryUserRepository
let fakeHasher: FakeHasher
let encrypter: FakeEncrypter

let sut: AuthenticateUserUseCase

describe('Authenticate User', () => {
  beforeEach(() => {
    inMemoryUserRepository = new InMemoryUserRepository()
    fakeHasher = new FakeHasher()
    encrypter = new FakeEncrypter()

    sut = new AuthenticateUserUseCase(
      inMemoryUserRepository,
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
    })
  })

  it('should sign the token with the user id as subject', async () => {
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
  })
})
