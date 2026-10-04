import { DevicesRepository } from '@/domain/accounts/applications/repositories/device-repository'
import { ConversationMemberRepository } from '../repositories/conversation-member-repository'

// Fan-out: todo device ativo de todo membro (inclusive os outros devices de
// quem originou o evento) recebe no seu inbox.
export async function findRecipientDeviceIds(
  conversationMemberRepository: ConversationMemberRepository,
  devicesRepository: DevicesRepository,
  conversationId: string
): Promise<string[]> {
  const members =
    await conversationMemberRepository.findManyByConversationId(conversationId)
  const devices = await devicesRepository.findManyByUserIds(
    members.map((member) => member.userId.toString())
  )

  return devices
    .filter((device) => !device.isRevoked)
    .map((device) => device.id.toString())
}
