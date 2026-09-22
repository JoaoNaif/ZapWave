import { Either, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { Presence } from '../gateways/presence'
import { PresenceDto } from '../dtos/presence-dto'

interface FetchPresenceUseCaseRequest {
  userId: string
}

type FetchPresenceUseCaseResponse = Either<null, { presence: PresenceDto }>

@Injectable()
export class FetchPresenceUseCase {
  constructor(private presence: Presence) {}

  async execute({
    userId,
  }: FetchPresenceUseCaseRequest): Promise<FetchPresenceUseCaseResponse> {
    const [online, lastSeenAt] = await Promise.all([
      this.presence.isOnline(userId),
      this.presence.lastSeenAt(userId),
    ])

    return right({
      presence: { userId, online, lastSeenAt },
    })
  }
}
