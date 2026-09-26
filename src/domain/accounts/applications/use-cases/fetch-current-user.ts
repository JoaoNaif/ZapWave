import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { UserRepository } from '../repositories/user-repository'
import { UserDto } from '../dtos/user-dto'
import { UserMapper } from '../mappers/user-mapper'
import { Injectable } from '@nestjs/common'

interface FetchCurrentUserReq {
  userId: string // quem está logado (vem do token)
}

type FetchCurrentUserRes = Either<ResourceNotFoundError, { user: UserDto }>

@Injectable()
export class FetchCurrentUserUseCase {
  constructor(private userRepository: UserRepository) {}

  async execute({ userId }: FetchCurrentUserReq): Promise<FetchCurrentUserRes> {
    const user = await this.userRepository.findById(userId)

    if (!user) {
      return left(new ResourceNotFoundError('user'))
    }

    return right({ user: UserMapper.toDto(user) })
  }
}
