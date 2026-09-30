import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/err/resource-not-found'
import { NotAllowedError } from '@/core/errors/err/not-allowed-error'
import { Injectable } from '@nestjs/common'
import { RoomInviteRepository } from '../repositories/room-invite-repository'

interface DeclineRoomInviteReq {
  inviteId: string
  userId: string
}

type DeclineRoomInviteRes = Either<
  ResourceNotFoundError | NotAllowedError,
  null
>

@Injectable()
export class DeclineRoomInviteUseCase {
  constructor(private roomInviteRepository: RoomInviteRepository) {}

  async execute({
    inviteId,
    userId,
  }: DeclineRoomInviteReq): Promise<DeclineRoomInviteRes> {
    const invite = await this.roomInviteRepository.findById(inviteId)

    if (!invite) return left(new ResourceNotFoundError('room invite'))

    // só o convidado recusa; quem convidou desfaz com revoke (não existe ainda)
    if (invite.inviteeId.toString() !== userId)
      return left(new NotAllowedError())

    if (invite.status !== 'pending') return left(new NotAllowedError())

    invite.decline()

    await this.roomInviteRepository.save(invite)

    return right(null)
  }
}
