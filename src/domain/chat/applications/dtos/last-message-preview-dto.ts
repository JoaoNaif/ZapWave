// A última mensagem de uma conversa, do jeito que a sidebar mostra: o nome de
// quem mandou vai junto porque a lista de salas não traz os membros.
export interface LastMessagePreviewDto {
  id: string
  senderId: string
  senderDisplayName: string
  // cortado em PREVIEW_MAX_LENGTH caracteres (com "…" no fim quando corta)
  body: string
  createdAt: Date
}
