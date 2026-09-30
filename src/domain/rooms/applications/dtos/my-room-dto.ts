// Um item da lista "meus grupos": o que a sidebar precisa pra mostrar a sala
// sem abrir ela. role é o papel de QUEM PEDIU a lista, não do dono.
export interface MyRoomDto {
  id: string
  name: string
  role: 'owner' | 'admin' | 'member'
  memberCount: number
  lastMessageAt: Date | null
  // mensagens dos outros depois do lastReadMessageId de quem pediu (ou do
  // joinedAt, se nunca marcou como lida)
  unreadCount: number
}
