import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { UniqueEntityId } from '@/core/entities/unique-entity-id'
import { ResourceAlreadyExistsError } from '@/core/errors/err/resource-already-exists-error'
import { DomainEvents } from '@/core/events/domain-events'
import { ConversationRepository } from '@/domain/chat/applications/repositories/conversation-repository'
import { Conversation } from '@/domain/chat/entities/conversation'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { RoomInviteRepository } from '@/domain/rooms/applications/repositories/room-invite-repository'
import { RoomInviteAcceptedEvent } from '@/domain/rooms/events/room-invite-accepted-event'
import { RoomInvite } from '@/domain/rooms/entities/room-invite'
import { DatabaseModule } from '@/infra/database/database.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'

// Prova que as escritas relacionadas são "tudo ou nada". O truque de cada
// teste de falha: a SEGUNDA escrita é forçada a falhar depois de a primeira
// já ter dado certo — e a primeira precisa ter sido desfeita.
describe('Atomic writes (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService
  let conversationRepository: ConversationRepository
  let roomInviteRepository: RoomInviteRepository

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [DatabaseModule],
    }).compile()

    app = moduleRef.createNestApplication()
    prisma = moduleRef.get(PrismaService)
    conversationRepository = moduleRef.get(ConversationRepository)
    roomInviteRepository = moduleRef.get(RoomInviteRepository)

    await app.init()
  })

  afterEach(() => {
    DomainEvents.clearHandlers()
    DomainEvents.clearMarkedAggregates()
  })

  afterAll(async () => {
    await app.close()
  })

  async function createUser() {
    return prisma.user.create({
      data: {
        username: randomUUID(),
        displayName: 'atomic-e2e',
        email: `${randomUUID()}@test.com`,
        passwordHash: 'x',
      },
    })
  }

  function makeRoom(createdById: string) {
    return Conversation.create({
      type: 'room',
      name: 'atomic-e2e',
      createdById: new UniqueEntityId(createdById),
    })
  }

  function makeMember(
    conversationId: UniqueEntityId,
    userId: string,
    role: 'owner' | 'admin' | 'member' = 'member'
  ) {
    return ConversationMember.create({
      conversationId,
      userId: new UniqueEntityId(userId),
      role,
      lastReadMessageId: null,
    })
  }

  describe('ConversationRepository.createWithMembers', () => {
    test('saves the conversation and every member together', async () => {
      const owner = await createUser()
      const other = await createUser()
      const room = makeRoom(owner.id)

      await conversationRepository.createWithMembers(room, [
        makeMember(room.id, owner.id, 'owner'),
        makeMember(room.id, other.id),
      ])

      const conversation = await prisma.conversation.findUnique({
        where: { id: room.id.toString() },
      })
      const members = await prisma.conversationMember.findMany({
        where: { conversationId: room.id.toString() },
      })

      expect(conversation?.type).toBe('ROOM')
      expect(members.map((m) => m.role).sort()).toEqual(['MEMBER', 'OWNER'])
    })

    test('leaves no conversation behind when a member cannot be saved', async () => {
      const owner = await createUser()
      const room = makeRoom(owner.id)

      await expect(
        conversationRepository.createWithMembers(room, [
          makeMember(room.id, owner.id, 'owner'),
          // usuário que não existe: a FK recusa DEPOIS da conversa gravada
          makeMember(room.id, randomUUID()),
        ])
      ).rejects.toThrow()

      expect(
        await prisma.conversation.findUnique({
          where: { id: room.id.toString() },
        })
      ).toBeNull()
      expect(
        await prisma.conversationMember.count({
          where: { conversationId: room.id.toString() },
        })
      ).toBe(0)
    })
  })

  describe('ConversationRepository.createWithMembers (one DM per pair)', () => {
    function makeDm(createdById: string, dmKey: string) {
      return Conversation.create({
        type: 'dm',
        name: null,
        createdById: new UniqueEntityId(createdById),
        dmKey,
      })
    }

    test('refuses a second DM for the same pair and leaves nothing behind', async () => {
      const userA = await createUser()
      const userB = await createUser()
      const dmKey = Conversation.dmKeyFor(userA.id, userB.id)
      const first = makeDm(userA.id, dmKey)
      const second = makeDm(userB.id, dmKey)

      await conversationRepository.createWithMembers(first, [
        makeMember(first.id, userA.id),
        makeMember(first.id, userB.id),
      ])

      await expect(
        conversationRepository.createWithMembers(second, [
          makeMember(second.id, userA.id),
          makeMember(second.id, userB.id),
        ])
      ).rejects.toBeInstanceOf(ResourceAlreadyExistsError)

      expect(await prisma.conversation.count({ where: { dmKey } })).toBe(1)
      expect(
        await prisma.conversation.findUnique({
          where: { id: second.id.toString() },
        })
      ).toBeNull()
      expect(
        await prisma.conversationMember.count({
          where: { conversationId: second.id.toString() },
        })
      ).toBe(0)
    })

    test('does not limit rooms: they have no key, so a user can have many', async () => {
      const owner = await createUser()
      const roomA = makeRoom(owner.id)
      const roomB = makeRoom(owner.id)

      await conversationRepository.createWithMembers(roomA, [
        makeMember(roomA.id, owner.id, 'owner'),
      ])
      await conversationRepository.createWithMembers(roomB, [
        makeMember(roomB.id, owner.id, 'owner'),
      ])

      expect(
        await prisma.conversation.count({ where: { createdById: owner.id } })
      ).toBe(2)
    })
  })

  describe('RoomInviteRepository.acceptWithMember', () => {
    async function createPendingInvite() {
      const inviter = await createUser()
      const invitee = await createUser()
      const room = makeRoom(inviter.id)
      await conversationRepository.createWithMembers(room, [
        makeMember(room.id, inviter.id, 'owner'),
      ])

      const invite = RoomInvite.create({
        conversationId: room.id,
        inviterId: new UniqueEntityId(inviter.id),
        inviteeId: new UniqueEntityId(invitee.id),
        status: 'pending',
      })
      await roomInviteRepository.create(invite)

      return { room, invite, invitee }
    }

    test('saves the new member and marks the invite accepted together', async () => {
      const { room, invite, invitee } = await createPendingInvite()

      invite.accept()
      await roomInviteRepository.acceptWithMember(
        invite,
        makeMember(room.id, invitee.id)
      )

      const stored = await prisma.roomInvite.findUnique({
        where: { id: invite.id.toString() },
      })
      const member = await prisma.conversationMember.findUnique({
        where: {
          conversationId_userId: {
            conversationId: room.id.toString(),
            userId: invitee.id,
          },
        },
      })

      expect(stored?.status).toBe('ACCEPTED')
      expect(stored?.respondedAt).not.toBeNull()
      expect(member?.role).toBe('MEMBER')
    })

    test('dispatches the "invite accepted" event only after everything was saved', async () => {
      const { room, invite, invitee } = await createPendingInvite()
      const received: RoomInviteAcceptedEvent[] = []
      DomainEvents.register(
        (event) => received.push(event),
        RoomInviteAcceptedEvent.name
      )

      invite.accept()
      await roomInviteRepository.acceptWithMember(
        invite,
        makeMember(room.id, invitee.id)
      )

      expect(received).toHaveLength(1)
    })

    test('leaves no member behind, and sends no event, when the invite cannot be updated', async () => {
      const { room, invitee } = await createPendingInvite()

      // convite que nunca foi gravado: o update falha DEPOIS de o membro já
      // ter sido inserido na mesma transação
      const ghostInvite = RoomInvite.create({
        conversationId: room.id,
        inviterId: new UniqueEntityId(),
        inviteeId: new UniqueEntityId(invitee.id),
        status: 'pending',
      })
      ghostInvite.accept()

      const received: RoomInviteAcceptedEvent[] = []
      DomainEvents.register(
        (event) => received.push(event),
        RoomInviteAcceptedEvent.name
      )

      await expect(
        roomInviteRepository.acceptWithMember(
          ghostInvite,
          makeMember(room.id, invitee.id)
        )
      ).rejects.toThrow()

      expect(
        await prisma.conversationMember.findUnique({
          where: {
            conversationId_userId: {
              conversationId: room.id.toString(),
              userId: invitee.id,
            },
          },
        })
      ).toBeNull()
      expect(received).toHaveLength(0)
    })
  })

  describe('RoomInviteRepository.create (unique per room + invitee)', () => {
    test('refuses a second invite for the same room and invitee', async () => {
      const inviter = await createUser()
      const invitee = await createUser()
      const room = makeRoom(inviter.id)
      await conversationRepository.createWithMembers(room, [
        makeMember(room.id, inviter.id, 'owner'),
      ])

      const makeInvite = () =>
        RoomInvite.create({
          conversationId: room.id,
          inviterId: new UniqueEntityId(inviter.id),
          inviteeId: new UniqueEntityId(invitee.id),
          status: 'pending',
        })

      await roomInviteRepository.create(makeInvite())

      await expect(
        roomInviteRepository.create(makeInvite())
      ).rejects.toBeInstanceOf(ResourceAlreadyExistsError)

      expect(
        await prisma.roomInvite.count({
          where: { conversationId: room.id.toString() },
        })
      ).toBe(1)
    })
  })
})
