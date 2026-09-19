import { Conversation } from '@/domain/chat/entities/conversation'
import { ConversationMember } from '@/domain/chat/entities/conversation-member'
import { RoomInvite } from '../../entities/room-invite'
import { RoomDto } from '../dtos/room-dto'
import { RoomMemberDto } from '../dtos/room-member-dto'
import { RoomInviteDto } from '../dtos/room-invite-dto'

export class RoomMapper {
  static toDto(room: Conversation): RoomDto {
    return {
      id: room.id.toString(),
      name: room.name,
      type: room.type,
      createdById: room.createdById.toString(),
      createdAt: room.createdAt,
    }
  }

  static memberToDto(member: ConversationMember): RoomMemberDto {
    return {
      id: member.id.toString(),
      roomId: member.conversationId.toString(),
      userId: member.userId.toString(),
      role: member.role,
      joinedAt: member.joinedAt,
      lastReadMessageId: member.lastReadMessageId?.toString() ?? null,
    }
  }

  static inviteToDto(invite: RoomInvite): RoomInviteDto {
    return {
      id: invite.id.toString(),
      roomId: invite.conversationId.toString(),
      inviterId: invite.inviterId.toString(),
      inviteeId: invite.inviteeId.toString(),
      status: invite.status,
      createdAt: invite.createdAt,
      respondedAt: invite.respondedAt,
    }
  }
}
