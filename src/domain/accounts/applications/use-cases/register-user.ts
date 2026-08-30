import { Either, left, right } from '@/core/either'
import { UserAlreadyExistsError } from '../errors/user-already-exists-error'
import { User } from '../../entities/user'
import { UserRepository } from '../repositories/user-repository'
import { HashGenerator } from '../cryptography/hash-generator'
import { UserDto } from '../dtos/user-dto'
import { UserMapper } from '../mappers/user-mapper'

interface RegisterUserReq {
  username: string
  displayName: string
  email: string
  password: string
}

type RegisterUserRes = Either<
  UserAlreadyExistsError,
  {
    user: UserDto
  }
>

export class RegisterUserUseCase {
  constructor(
    private userRepository: UserRepository,
    private hashGenerator: HashGenerator
  ) {}

  async execute({
    displayName,
    email,
    password,
    username,
  }: RegisterUserReq): Promise<RegisterUserRes> {
    const userWithSameEmail = await this.userRepository.findByEmail(email)

    if (userWithSameEmail) {
      return left(new UserAlreadyExistsError('email'))
    }

    const userWithSameUsername =
      await this.userRepository.findByUsername(username)

    if (userWithSameUsername) {
      return left(new UserAlreadyExistsError('username'))
    }

    const hashedPassword = await this.hashGenerator.hash(password)

    const user = User.create({
      displayName,
      email,
      passwordHash: hashedPassword,
      username,
    })

    await this.userRepository.create(user)

    return right({
      user: UserMapper.toDto(user),
    })
  }
}
