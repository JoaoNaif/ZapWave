import { Either, left, right } from '@/core/either'
import { UserRepository } from '../repositories/user-repository'
import { HashCompare } from '../cryptography/hash-compare'
import { HashGenerator } from '../cryptography/hash-generator'
import { Encrypter } from '../cryptography/encrypter'
import { WrongCredentialsError } from '../errors/wrong-credentials-error'
import { DevicesRepository } from '../repositories/device-repository'
import { Device } from '../../entities/device'
import { Injectable } from '@nestjs/common'

interface AuthenticateUserReq {
  email: string
  password: string
  deviceName?: string | null
}

// Um erro só, de propósito: "e-mail não existe" e "senha errada" não podem ser
// distinguíveis por quem chama, senão o login serve pra descobrir quais
// e-mails têm conta.
type AuthenticateUserRes = Either<
  WrongCredentialsError,
  {
    accessToken: string
    deviceId: string
  }
>

@Injectable()
export class AuthenticateUserUseCase {
  constructor(
    private userRepository: UserRepository,
    private devicesRepository: DevicesRepository,
    private hashCompare: HashCompare,
    private hashGenerator: HashGenerator,
    private encrypter: Encrypter
  ) {}

  async execute({
    email,
    password,
    deviceName,
  }: AuthenticateUserReq): Promise<AuthenticateUserRes> {
    const user = await this.userRepository.findByEmail(email)

    if (!user) {
      // O hash da senha é lento de propósito. Se só o caminho "senha errada"
      // pagasse esse custo, o tempo da resposta entregaria que o e-mail existe.
      // Gerar um hash aqui gasta o mesmo tempo e joga o resultado fora.
      await this.hashGenerator.hash(password)

      return left(new WrongCredentialsError())
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
