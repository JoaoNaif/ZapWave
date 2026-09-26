import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { UserRepository } from '../repositories/user-repository'
import { UserSummaryDto } from '../dtos/user-summary-dto'
import { UserMapper } from '../mappers/user-mapper'
import { Injectable } from '@nestjs/common'

interface FetchUserByUsernameReq {
  username: string
}

type FetchUserByUsernameRes = Either<
  ResourceNotFoundError,
  { user: UserSummaryDto }
>

// Busca EXATA, de propósito: é o que permite achar alguém pra adicionar sem
// deixar ninguém listar os usuários do sistema digitando "a", "b", "c"...
@Injectable()
export class FetchUserByUsernameUseCase {
  constructor(private userRepository: UserRepository) {}

  async execute({
    username,
  }: FetchUserByUsernameReq): Promise<FetchUserByUsernameRes> {
    const user = await this.userRepository.findByUsername(username)

    if (!user) {
      return left(new ResourceNotFoundError('user'))
    }

    return right({ user: UserMapper.toSummaryDto(user) })
  }
}
