import { beforeEach, describe, expect, it } from 'vitest'
import { FetchUserByUsernameUseCase } from './fetch-user-by-username'
import { InMemoryUserRepository } from 'test/repositories/in-memory-user-repository'
import { makeUser } from 'test/factories/make-user'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'

let inMemoryUserRepository: InMemoryUserRepository

let sut: FetchUserByUsernameUseCase

describe('Fetch User By Username', () => {
  beforeEach(() => {
    inMemoryUserRepository = new InMemoryUserRepository()

    sut = new FetchUserByUsernameUseCase(inMemoryUserRepository)
  })

  it('should be able to find a user by the exact username', async () => {
    const user = makeUser({ username: 'joao123', displayName: 'João' })

    await inMemoryUserRepository.create(user)

    const result = await sut.execute({ username: 'joao123' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(result.value.user).toEqual({
        id: user.id.toString(),
        username: 'joao123',
        displayName: 'João',
      })
    }
  })

  // toEqual acima já garante os campos; aqui fica explícito o que NÃO pode vazar
  it('should only expose public fields, never email or password hash', async () => {
    await inMemoryUserRepository.create(makeUser({ username: 'joao123' }))

    const result = await sut.execute({ username: 'joao123' })

    expect(result.isRight()).toBe(true)
    if (result.isRight()) {
      expect(Object.keys(result.value.user).sort()).toEqual([
        'displayName',
        'id',
        'username',
      ])
    }
  })

  it('should not match a partial username', async () => {
    await inMemoryUserRepository.create(makeUser({ username: 'joao123' }))

    const result = await sut.execute({ username: 'joao' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })

  it('should fail when the username does not exist', async () => {
    const result = await sut.execute({ username: 'ghost' })

    expect(result.isLeft()).toBe(true)
    expect(result.value).toBeInstanceOf(ResourceNotFoundError)
  })
})
