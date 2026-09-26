import { beforeEach, describe, expect, it } from 'vitest'
import { FetchCurrentUserUseCase } from './fetch-current-user'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { makeUser } from 'test/factories/make-user'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryUserRepository: InMemoryUserRepository

let sut: FetchCurrentUserUseCase

describe('Fetch Current User', () => {
  beforeEach(() => {
    inMemoryUserRepository = new InMemoryUserRepository()

    sut = new FetchCurrentUserUseCase(inMemoryUserRepository)
  })

  it('should be able to fetch the logged user', async () => {
    const user = makeUser({
      username: 'johndoe',
      displayName: 'John Doe',
      email: 'johndoe@email.com',
    })

    await inMemoryUserRepository.create(user)

    const result = await sut.execute({ userId: user.id.toString() })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.user).toEqual({
        id: user.id.toString(),
        username: 'johndoe',
        displayName: 'John Doe',
        email: 'johndoe@email.com',
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      })
    }
  })

  it('should never expose the password hash', async () => {
    const user = makeUser()

    await inMemoryUserRepository.create(user)

    const result = await sut.execute({ userId: user.id.toString() })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.user).not.toHaveProperty('passwordHash')
    }
  })

  it('should fail when the user does not exist anymore', async () => {
    const result = await sut.execute({ userId: 'ghost-user' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
