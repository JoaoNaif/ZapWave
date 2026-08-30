import { beforeEach, describe, expect, it } from 'vitest'
import { RegisterUserUseCase } from './register-user'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { FakeHasher } from 'test/cryptography/fake-hasher'
import { makeUser } from 'test/factories/make-user'
import { UserAlreadyExistsError } from '../errors/user-already-exists-error'

let inMemoryUserRepository: InMemoryUserRepository
let fakeHasher: FakeHasher

let sut: RegisterUserUseCase

describe('Register User', () => {
  beforeEach(() => {
    inMemoryUserRepository = new InMemoryUserRepository()
    fakeHasher = new FakeHasher()

    sut = new RegisterUserUseCase(inMemoryUserRepository, fakeHasher)
  })

  it('should be able to register a new user', async () => {
    const result = await sut.execute({
      username: 'johndoe',
      displayName: 'John Doe',
      email: 'johndoe@email.com',
      password: '123456',
    })

    expect(result.isRight()).toBe(true)
    expect(result.value).toEqual({
      user: expect.objectContaining({
        username: 'johndoe',
        displayName: 'John Doe',
        email: 'johndoe@email.com',
      }),
    })
    expect(inMemoryUserRepository.items[0].username).toEqual('johndoe')
  })

  it('should hash the user password on registration', async () => {
    const result = await sut.execute({
      username: 'johndoe',
      displayName: 'John Doe',
      email: 'johndoe@email.com',
      password: '123456',
    })

    expect(result.isRight()).toBe(true)
    expect(inMemoryUserRepository.items[0].passwordHash).toEqual(
      '123456-hashed'
    )
  })

  it('should not expose the password hash in the response', async () => {
    const result = await sut.execute({
      username: 'johndoe',
      displayName: 'John Doe',
      email: 'johndoe@email.com',
      password: '123456',
    })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.user).not.toHaveProperty('passwordHash')
      expect(result.value.user).not.toHaveProperty('password')
    }
  })

  it('should not be able to register with an email already in use', async () => {
    await inMemoryUserRepository.create(
      makeUser({ email: 'johndoe@email.com' })
    )

    const result = await sut.execute({
      username: 'anotherjohn',
      displayName: 'John Doe',
      email: 'johndoe@email.com',
      password: '123456',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(UserAlreadyExistsError)
    expect(inMemoryUserRepository.items).toHaveLength(1)
  })

  it('should not be able to register with a username already in use', async () => {
    await inMemoryUserRepository.create(makeUser({ username: 'johndoe' }))

    const result = await sut.execute({
      username: 'johndoe',
      displayName: 'John Doe',
      email: 'other@email.com',
      password: '123456',
    })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(UserAlreadyExistsError)
    expect(inMemoryUserRepository.items).toHaveLength(1)
  })
})
