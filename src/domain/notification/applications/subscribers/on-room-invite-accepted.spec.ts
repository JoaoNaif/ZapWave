import { beforeEach, describe, expect, it, vi, MockInstance } from 'vitest'
import { makeRoomInvite } from 'test/factories/make-room-invite'
import { InMemoryRoomInviteRepository } from 'test/repositories/in-memory-room-invite-repository'
import { InMemoryNotificationsRepository } from 'test/repositories/in-memory-notification-repository'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import {
  SendNotificationUseCase,
  SendNotificationUseCaseRequest,
  SendNotificationUseCaseResponse,
} from '../use-cases/send-notification'
import { OnRoomInviteAccepted } from './on-room-invite-accepted'

let inMemoryRoomInviteRepository: InMemoryRoomInviteRepository
let inMemoryNotificationsRepository: InMemoryNotificationsRepository
let sendNotificationUseCase: SendNotificationUseCase

let sendNotificationExecuteSpy: MockInstance<
  (
    request: SendNotificationUseCaseRequest
  ) => Promise<SendNotificationUseCaseResponse>
>

describe('On Room Invite Accepted', () => {
  beforeEach(() => {
    inMemoryRoomInviteRepository = new InMemoryRoomInviteRepository()
    inMemoryNotificationsRepository = new InMemoryNotificationsRepository()
    sendNotificationUseCase = new SendNotificationUseCase(
      inMemoryNotificationsRepository
    )

    sendNotificationExecuteSpy = vi.spyOn(sendNotificationUseCase, 'execute')

    new OnRoomInviteAccepted(sendNotificationUseCase)
  })

  it('should send a notification to the inviter when the invitee accepts', async () => {
    const roomInvite = makeRoomInvite(
      {
        inviterId: new UniqueEntityId('inviter-1'),
        inviteeId: new UniqueEntityId('invitee-1'),
        status: 'pending',
      },
      new UniqueEntityId('invite-1')
    )

    await inMemoryRoomInviteRepository.create(roomInvite)

    roomInvite.accept()
    await inMemoryRoomInviteRepository.save(roomInvite)

    expect(sendNotificationExecuteSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: 'inviter-1',
      })
    )

    expect(inMemoryNotificationsRepository.items).toHaveLength(1)
    expect(
      inMemoryNotificationsRepository.items[0].recipientId.toString()
    ).toBe('inviter-1')
  })
})
