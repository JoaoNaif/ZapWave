import { Either, left, right } from '@/core/either'
import { UserRepository } from '../repositories/user-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { HashCompare } from '../cryptography/hash-compare'
import { Encrypter } from '../cryptography/encrypter'
import { WrongCredentialsError } from '../errors/wrong-credentials-error'

interface AuthenticateUserReq {
  email: string
  password: string
}

type AuthenticateUserRes = Either<
  WrongCredentialsError | ResourceNotFoundError,
  {
    accessToken: string
  }
>

export class AuthenticateUserUseCase {
  constructor(
    private userRepository: UserRepository,
    private hashCompare: HashCompare,
    private encrypter: Encrypter
  ) {}

  async execute({
    email,
    password,
  }: AuthenticateUserReq): Promise<AuthenticateUserRes> {
    const user = await this.userRepository.findByEmail(email)

    if (!user) {
      return left(new ResourceNotFoundError('user'))
    }

    const isPasswordValid = await this.hashCompare.compare(
      password,
      user.passwordHash
    )

    if (!isPasswordValid) {
      return left(new WrongCredentialsError())
    }

    const accessToken = await this.encrypter.encrypt({
      sub: user.id.toString(),
    })

    return right({
      accessToken,
    })
  }
}
