import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { DomainEvents } from '@/core/events/domain-events'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { RoomInviteRepository } from '@/domain/rooms/applications/repositories/room-invite-repository'
import { RoomInvite } from '@/domain/rooms/entities/room-invite'
import { InMemoryConversationMemberRepository } from './in-memory-conversation-member-repository'

export class InMemoryRoomInviteRepository implements RoomInviteRepository {
  public items: RoomInvite[] = []

  // só acceptWithMember precisa dele: grava o membro junto, como o banco
  constructor(
    private memberRepository?: InMemoryConversationMemberRepository
  ) {}

  async findById(id: string): Promise<RoomInvite | null> {
    const roomInvite = this.items.find((item) => item.id.toString() === id)

    if (!roomInvite) {
      return null
    }

    return roomInvite
  }

  async findByConversationIdAndInviteeId(
    conversationId: string,
    inviteeId: string
  ): Promise<RoomInvite | null> {
    const roomInvite = this.items.find(
      (item) =>
        item.conversationId.toString() === conversationId &&
        item.inviteeId.toString() === inviteeId
    )

    if (!roomInvite) {
      return null
    }

    return roomInvite
  }

  async findManyByIviteeIdWithStausPending(
    inviteeId: string,
    status: string
  ): Promise<RoomInvite[]> {
    return this.items.filter(
      (item) =>
        item.inviteeId.toString() === inviteeId && item.status === status
    )
  }

  async create(roomInvite: RoomInvite): Promise<void> {
    // espelha a constraint única (conversationId, inviteeId) do banco
    const alreadyExists = this.items.some(
      (item) =>
        item.conversationId.equals(roomInvite.conversationId) &&
        item.inviteeId.equals(roomInvite.inviteeId)
    )

    if (alreadyExists) throw new ResourceAlreadyExistsError('room invite')

    this.items.push(roomInvite)

    DomainEvents.dispatchEventsForAggregate(roomInvite.id)
  }

  async acceptWithMember(
    invite: RoomInvite,
    member: ConversationMember
  ): Promise<void> {
    if (!this.memberRepository) {
      throw new Error(
        'InMemoryRoomInviteRepository precisa do repositório de membros para acceptWithMember'
      )
    }

    await this.memberRepository.create(member)
    await this.save(invite)
  }

  async save(roomInvite: RoomInvite): Promise<void> {
    const itemIndex = this.items.findIndex((item) =>
      item.id.equals(roomInvite.id)
    )

    this.items[itemIndex] = roomInvite

    DomainEvents.dispatchEventsForAggregate(roomInvite.id)
  }

  async delete(roomInvite: RoomInvite): Promise<void> {
    const itemIndex = this.items.findIndex((item) =>
      item.id.equals(roomInvite.id)
    )

    this.items.splice(itemIndex, 1)
  }
}
