import { Either, left, right } from '@/core/either'
import { UserRepository } from '../repositories/user-repository'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { HashCompare } from '../cryptography/hash-compare'
import { Encrypter } from '../cryptography/encrypter'
import { WrongCredentialsError } from '../errors/wrong-credentials-error'
import { DevicesRepository } from '../repositories/device-repository'
import { Device } from '../../entities/device'

interface AuthenticateUserReq {
  email: string
  password: string
  deviceName?: string | null
}

type AuthenticateUserRes = Either<
  WrongCredentialsError | ResourceNotFoundError,
  {
    accessToken: string
    deviceId: string
  }
>

export class AuthenticateUserUseCase {
  constructor(
    private userRepository: UserRepository,
    private devicesRepository: DevicesRepository,
    private hashCompare: HashCompare,
    private encrypter: Encrypter
  ) {}

  async execute({
    email,
    password,
    deviceName,
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

    const device = Device.create({
      userId: user.id,
      name: deviceName ?? null,
    })

    await this.devicesRepository.create(device)

    const accessToken = await this.encrypter.encrypt({
      sub: user.id.toString(),
      deviceId: device.id.toString(),
    })

    return right({
      accessToken,
      deviceId: device.id.toString(),
    })
  }
}
