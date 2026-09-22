export abstract class Presence {
  // Marca o usuário como online agora. Chamado ao conectar e a cada
  // ping/pong do WebSocket (ver docs/05-websocket.md).
  abstract heartbeat(userId: string): Promise<void>

  // Online = teve heartbeat dentro da janela recente. Não existe "ficar
  // offline" explícito — a ausência de heartbeat é o que apaga sozinho.
  abstract isOnline(userId: string): Promise<boolean>

  // Timestamp do último heartbeat, esteja o usuário online ou não agora.
  // null = nunca teve heartbeat registrado.
  abstract lastSeenAt(userId: string): Promise<Date | null>
}
